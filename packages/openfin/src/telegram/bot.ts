import { Bot, InlineKeyboard } from "grammy"
import { api, API_BASE } from "../tui/context/sdk"
import { SessionMap } from "./session-map"
import { mdToTelegramHtml } from "./md-to-html"

const DEBOUNCE_MS = 800 // edit message at most every 800ms (Telegram rate limit)

// ── Auth ──────────────────────────────────────────────────────────────────────

const ALLOWED_CHATS = (process.env["TELEGRAM_ALLOWED_CHATS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number)

function isAllowed(chatId: number): boolean {
  if (ALLOWED_CHATS.length === 0) return true // open if no whitelist configured
  return ALLOWED_CHATS.includes(chatId)
}

// ── SSE streaming ─────────────────────────────────────────────────────────────

interface StreamSession {
  content: string
  telegramMessageId: number
  chatId: number
  lastEdit: number
  editTimer: ReturnType<typeof setTimeout> | null
  done: boolean
}

const activeStreams = new Map<string, StreamSession>() // sessionId → state

async function editWithDebounce(bot: Bot, stream: StreamSession, force = false) {
  if (stream.done && !force) return
  const now = Date.now()
  if (!force && now - stream.lastEdit < DEBOUNCE_MS) {
    if (!stream.editTimer) {
      stream.editTimer = setTimeout(async () => {
        stream.editTimer = null
        await editWithDebounce(bot, stream, true)
      }, DEBOUNCE_MS - (now - stream.lastEdit))
    }
    return
  }
  if (stream.editTimer) {
    clearTimeout(stream.editTimer)
    stream.editTimer = null
  }
  stream.lastEdit = Date.now()
  try {
    await bot.api.editMessageText(stream.chatId, stream.telegramMessageId, mdToTelegramHtml(stream.content || "…"), {
      parse_mode: "HTML",
    })
  } catch {
    // message may not have changed — ignore Telegram's "message is not modified" error
  }
}

export function startSSEListener(bot: Bot) {
  const abortController = new AbortController()

  async function connect() {
    try {
      const res = await fetch(`${API_BASE}/event`, { signal: abortController.signal })
      if (!res.ok || !res.body) throw new Error("SSE connect failed")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          const raw = line.slice(5).trim()
          if (!raw) continue
          try {
            const event = JSON.parse(raw)
            await handleSSEEvent(bot, event)
          } catch {}
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return
      console.error("[telegram] SSE disconnected, reconnecting in 3s…", err?.message)
    }
    setTimeout(connect, 3000)
  }

  connect()
  return () => abortController.abort()
}

async function handleSSEEvent(bot: Bot, event: { type: string; properties: any }) {
  if (event.type === "profile.budget.exceeded") {
    const { category, used, limit, percent, currency } = event.properties
    const fmtAmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
    const chats = await SessionMap.listChats()
    for (const chatId of chats) {
      try {
        await bot.api.sendMessage(
          chatId,
          `🔴 *Budget exceeded — ${category}*\n\nSpent: ${fmtAmt(used)} / ${fmtAmt(limit)} (${percent}%)\n\nYou've gone over your ${category} budget this month.`,
          { parse_mode: "Markdown" },
        )
      } catch {}
    }
    return
  }

  if (event.type === "profile.goal.reached") {
    const { name, amount, currency } = event.properties
    const fmtAmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
    const chats = await SessionMap.listChats()
    for (const chatId of chats) {
      try {
        await bot.api.sendMessage(
          chatId,
          `🎉 *Goal reached — ${name}*\n\nYou've saved ${fmtAmt(amount)} and hit your target. Congratulations!`,
          { parse_mode: "Markdown" },
        )
      } catch {}
    }
    return
  }

  if (event.type === "recurring.auto_logged") {
    const { items } = event.properties as { items: { title: string; amount: number; type: string; category: string; currency: string }[] }
    const fmtAmt = (n: number, currency: string) =>
      `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
    const lines = items.map((item) => {
      const sign = item.type === "expense" ? "💸" : "💰"
      return `${sign} ${item.title} — ${fmtAmt(item.amount, item.currency)} (${item.category})`
    })
    const chats = await SessionMap.listChats()
    for (const chatId of chats) {
      try {
        await bot.api.sendMessage(
          chatId,
          `🔄 *Recurring transactions logged*\n\n${lines.join("\n")}`,
          { parse_mode: "Markdown" },
        )
      } catch {}
    }
    return
  }

  if (event.type === "message.part.updated") {
    const { sessionID, part } = event.properties
    const stream = activeStreams.get(sessionID)
    if (!stream || stream.done) return
    if (part.type === "text") {
      stream.content = part.text
      await editWithDebounce(bot, stream)
    }
  }

  if (event.type === "session.status" && event.properties.status === "idle") {
    const { sessionID } = event.properties
    const stream = activeStreams.get(sessionID)
    if (!stream) return
    stream.done = true
    if (stream.editTimer) clearTimeout(stream.editTimer)
    // Final edit with full content
    try {
      await bot.api.editMessageText(stream.chatId, stream.telegramMessageId, mdToTelegramHtml(stream.content || "…"), {
        parse_mode: "HTML",
      })
    } catch {}
    activeStreams.delete(sessionID)
  }

  if (event.type === "session.error") {
    const { sessionID, error } = event.properties
    const stream = activeStreams.get(sessionID)
    if (!stream) return
    stream.done = true
    if (stream.editTimer) clearTimeout(stream.editTimer)
    try {
      await bot.api.editMessageText(stream.chatId, stream.telegramMessageId, `❌ ${error}`)
    } catch {}
    activeStreams.delete(sessionID)
  }
}

// ── Session helpers ───────────────────────────────────────────────────────────

async function getOrCreateSession(chatId: number): Promise<string> {
  const existing = await SessionMap.get(chatId)
  if (existing) return existing
  const session = await api.createSession()
  await SessionMap.set(chatId, session.id)
  return session.id
}

async function newSession(chatId: number): Promise<string> {
  const session = await api.createSession()
  await SessionMap.set(chatId, session.id)
  return session.id
}

// ── Direct command helper ─────────────────────────────────────────────────────

async function runCmd(ctx: { reply: (text: string) => Promise<any> }, command: string, args: string[] = []) {
  try {
    const output = await api.runCmd(command, args)
    const plain = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    await ctx.reply(plain || "Done.")
  } catch (err) {
    await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── Bot setup ─────────────────────────────────────────────────────────────────

export function createBot(token: string): Bot {
  const bot = new Bot(token)

  // Middleware: check whitelist
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id
    if (!chatId || !isAllowed(chatId)) {
      await ctx.reply("Unauthorized.")
      return
    }
    await next()
  })

  // /start
  bot.command("start", async (ctx) => {
    await getOrCreateSession(ctx.chat.id)
    await ctx.reply(
      "👋 OpenFin connected. Type any message to chat with your financial assistant.\n\nAvailable commands: /help",
    )
  })

  // /new — new session
  bot.command("new", async (ctx) => {
    await newSession(ctx.chat.id)
    await ctx.reply("✅ New session started.")
  })

  // /accounts
  bot.command("accounts", async (ctx) => { await runCmd(ctx, "accounts") })

  // /debts
  bot.command("debts", async (ctx) => { await runCmd(ctx, "debts") })

  // /budgets
  bot.command("budgets", async (ctx) => { await runCmd(ctx, "budgets") })

  // /goals
  bot.command("goals", async (ctx) => { await runCmd(ctx, "goals") })

  // /recurring
  bot.command("recurring", async (ctx) => { await runCmd(ctx, "recurring") })

  // /networth
  bot.command("networth", async (ctx) => { await runCmd(ctx, "networth") })

  // /alerts
  bot.command("alerts", async (ctx) => { await runCmd(ctx, "alerts") })

  // /spending [period]
  bot.command("spending", async (ctx) => {
    const args = ctx.message?.text.split(/\s+/).slice(1) ?? []
    await runCmd(ctx, "spending", args)
  })

  // /txs [period] [income|expense] [category] [@account]
  bot.command("txs", async (ctx) => {
    const args = ctx.message?.text.split(/\s+/).slice(1) ?? []
    await runCmd(ctx, "txs", args)
  })

  // /model — inline keyboard
  bot.command("model", async (ctx) => {
    try {
      const models = await api.listModels()
      if (models.length === 0) {
        await ctx.reply("No models available. Check your API keys configuration.")
        return
      }

      const keyboard = new InlineKeyboard()
      for (const model of models) {
        keyboard.text(`${model.name} · ${model.providerName}`, `model:${model.id}`).row()
      }
      await ctx.reply("Select a model:", { reply_markup: keyboard })
    } catch (err) {
      await ctx.reply("Error loading models.")
    }
  })

  // /abort
  bot.command("abort", async (ctx) => {
    const sessionId = await SessionMap.get(ctx.chat.id)
    if (!sessionId) {
      await ctx.reply("No active session.")
      return
    }
    await api.abortSession(sessionId)
    activeStreams.delete(sessionId)
    await ctx.reply("⏹ Response cancelled.")
  })

  // /history — session list
  bot.command("history", async (ctx) => {
    try {
      const sessions = await api.listSessions()
      if (sessions.length === 0) {
        await ctx.reply("No previous sessions.")
        return
      }
      const lines = sessions
        .slice(0, 10)
        .map((s, i) => `${i + 1}. ${s.title || "Untitled"} — ${new Date(s.time.updated).toLocaleDateString("en-US")}`)
      await ctx.reply(`Recent sessions:\n\n${lines.join("\n")}`)
    } catch {
      await ctx.reply("Error loading history.")
    }
  })

  // /help
  bot.command("help", async (ctx) => {
    await ctx.reply(
      `*OpenFin — Commands*\n\n` +
        `*Finance (instant)*\n` +
        `/accounts — Accounts & balances\n` +
        `/debts — Debts summary\n` +
        `/budgets — Budgets & spending\n` +
        `/goals — Savings goals\n` +
        `/recurring — Recurring transactions\n` +
        `/networth — Net worth summary\n` +
        `/alerts — Active alerts\n` +
        `/spending [period] — Expense breakdown\n` +
        `/txs [period] [type] [cat] — Transactions\n` +
        `\n*Session*\n` +
        `/new — New conversation\n` +
        `/model — Change AI model\n` +
        `/history — Previous sessions\n` +
        `/abort — Cancel current response\n` +
        `/help — This help\n` +
        `\nPeriods: this\\_month · last\\_month · last\\_30\\_days · this\\_year`,
      { parse_mode: "Markdown" },
    )
  })

  // Inline keyboard callback — model selection
  bot.callbackQuery(/^model:(.+)$/, async (ctx) => {
    const modelId = ctx.match[1]!
    // Store selected model per chat in a simple in-memory map
    // (the server will use whatever model is passed in the request body)
    selectedModels.set(ctx.chat!.id, modelId)
    await ctx.answerCallbackQuery()
    await ctx.editMessageText(`✅ Modelo seleccionado: \`${modelId}\``, { parse_mode: "Markdown" })
  })

  // Text messages → forward to session
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return // ignore unknown commands
    const sessionId = await getOrCreateSession(ctx.chat.id)
    const model = selectedModels.get(ctx.chat.id)
    await sendMessage(bot, ctx.chat.id, sessionId, ctx.message.text, model)
  })

  bot.on("message:photo", async (ctx) => {
    const sessionId = await getOrCreateSession(ctx.chat.id)
    const model = selectedModels.get(ctx.chat.id)
    const caption = ctx.message.caption ?? ""

    try {
      const attachments = await downloadPhotos(bot.token, ctx.message.photo)
      await sendMessage(bot, ctx.chat.id, sessionId, caption, model, attachments)
    } catch {
      await ctx.reply("❌ No se pudo procesar la imagen.")
    }
  })

  return bot
}

// Per-chat selected model (in-memory, resets on restart — good enough for now)
const selectedModels = new Map<number, string>()

async function downloadPhotos(
  token: string,
  photos: { file_id: string }[],
): Promise<{ mime: string; data: string; filename?: string }[]> {
  // Telegram sends multiple sizes — pick the largest (last in array)
  const photo = photos[photos.length - 1]!
  const fileInfo = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${photo.file_id}`)
  const { result } = (await fileInfo.json()) as { result: { file_path: string } }
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${result.file_path}`)
  const buffer = await res.arrayBuffer()
  const base64 = Buffer.from(buffer).toString("base64")
  return [{ mime: "image/jpeg", data: base64, filename: "photo.jpg" }]
}

export async function sendMessage(
  bot: Bot,
  chatId: number,
  sessionId: string,
  content: string,
  model?: string,
  attachments?: { mime: string; data: string; filename?: string }[],
) {
  // Send placeholder message to edit later with streamed content
  const placeholder = await bot.api.sendMessage(chatId, "…")

  activeStreams.set(sessionId, {
    content: "",
    telegramMessageId: placeholder.message_id,
    chatId,
    lastEdit: 0,
    editTimer: null,
    done: false,
  })

  try {
    await api.sendMessage(sessionId, content, model, attachments)
  } catch (err) {
    activeStreams.delete(sessionId)
    await bot.api.editMessageText(chatId, placeholder.message_id, "❌ Error al enviar mensaje.")
  }
}
