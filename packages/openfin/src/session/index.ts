import { streamText, stepCountIs, type ModelMessage } from "ai"
import { Database, eq, desc } from "../storage/db"
import { NotFoundError } from "../storage/db"
import { SessionTable, MessageTable, PartTable } from "./session.sql"
import { Provider } from "../provider/provider"
import { getSystemPrompt } from "../provider/system"
import { buildFinancialContext } from "../profile/context"
import { Skill } from "../skill/skill"
import { Bus } from "../bus/index"
import { Message } from "./message"
import { ToolRegistry } from "../tool/registry"
import { Identifier } from "../id/id"
import { Installation } from "../installation"
import { Log } from "../util/log"

const log = Log.create({ service: "session" })

export namespace Session {
  export interface Info {
    id: string
    title: string
    time: { created: number; updated: number }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  export function create(opts: { title?: string } = {}): Info {
    const now = Date.now()
    const id = Identifier.ascending("session")
    const title = opts.title ?? `Chat ${new Date(now).toLocaleString()}`

    Database.use((db) =>
      db
        .insert(SessionTable)
        .values({
          id,
          project_id: "openfin",
          slug: `session-${id.slice(0, 12)}`,
          directory: process.cwd(),
          title,
          version: Installation.VERSION,
          time_created: now,
          time_updated: now,
        })
        .run(),
    )

    return { id, title, time: { created: now, updated: now } }
  }

  export function get(id: string): Info {
    const row = Database.use((db) =>
      db.select().from(SessionTable).where(eq(SessionTable.id, id)).limit(1).get(),
    )
    if (!row) throw new NotFoundError({ message: `Session not found: ${id}` })
    return toInfo(row)
  }

  export function list(): Info[] {
    return Database.use((db) =>
      db.select().from(SessionTable).orderBy(desc(SessionTable.time_created)).all(),
    ).map(toInfo)
  }

  export function remove(id: string): void {
    Database.use((db) => db.delete(SessionTable).where(eq(SessionTable.id, id)).run())
  }

  export function rename(id: string, title: string): Info {
    const now = Date.now()
    Database.use((db) =>
      db
        .update(SessionTable)
        .set({ title, time_updated: now })
        .where(eq(SessionTable.id, id))
        .run(),
    )
    return get(id)
  }

  export function parts(sessionId: string): Record<string, Message.Part[]> {
    const rows = Database.use((db) =>
      db.select().from(PartTable).where(eq(PartTable.session_id, sessionId)).orderBy(PartTable.time_created).all(),
    )
    const result: Record<string, Message.Part[]> = {}
    for (const row of rows) {
      const part = row.data as Message.Part
      if (!result[row.message_id]) result[row.message_id] = []
      result[row.message_id]!.push(part)
    }
    return result
  }

  export function messages(sessionId: string): Message.Row[] {
    const msgRows = Database.use((db) =>
      db
        .select()
        .from(MessageTable)
        .where(eq(MessageTable.session_id, sessionId))
        .orderBy(MessageTable.time_created)
        .all(),
    )

    return msgRows.map((r) => {
      const info = r.data as Message.Info
      const parts = Database.use((db) =>
        db.select().from(PartTable).where(eq(PartTable.message_id, r.id)).orderBy(PartTable.time_created).all(),
      )
      const content = parts
        .map((p) => p.data as Message.Part)
        .filter((p): p is Message.TextPart => p.type === "text")
        .map((p) => p.text)
        .join("")

      if (info.role === "user") {
        return {
          id: r.id,
          sessionId: r.session_id,
          data: { role: "user" as const, content },
          time: { created: r.time_created, updated: r.time_updated },
        }
      } else {
        const ai = info as Message.AssistantInfo
        return {
          id: r.id,
          sessionId: r.session_id,
          data: {
            role: "assistant" as const,
            content,
            model: ai.modelID,
            time_completed: ai.time.completed ?? r.time_updated,
            tokens: ai.tokens,
          },
          time: { created: r.time_created, updated: r.time_updated },
        }
      }
    })
  }

  // ── Abort ──────────────────────────────────────────────────────────────────

  const abortControllers = new Map<string, AbortController>()

  export function abort(sessionId: string): void {
    abortControllers.get(sessionId)?.abort()
  }

  // ── LLM Streaming ─────────────────────────────────────────────────────────

  export interface Attachment {
    mime: string
    data: string // base64
    filename?: string
  }

  export async function* chat(
    sessionId: string,
    content: string,
    modelId = Provider.defaultModel(),
    attachments: Attachment[] = [],
  ): AsyncGenerator<string> {
    const now = Date.now()
    const userMsgID = Identifier.ascending("message")
    const assistantMsgID = Identifier.ascending("message")
    const assistantPartID = Identifier.ascending("part")

    // 1. Load history BEFORE saving the new message (avoids duplicating it)
    const history = loadHistory(sessionId)

    // 2. Save user message + TextPart
    const userPartID = Identifier.ascending("part")
    Database.use((db) => {
      db.insert(MessageTable)
        .values({
          id: userMsgID,
          session_id: sessionId,
          data: {
            id: userMsgID,
            sessionID: sessionId,
            role: "user",
            time: { created: now },
          } satisfies Message.UserInfo,
          time_created: now,
          time_updated: now,
        })
        .run()
      db.insert(PartTable)
        .values({
          id: userPartID,
          message_id: userMsgID,
          session_id: sessionId,
          data: {
            id: userPartID,
            sessionID: sessionId,
            messageID: userMsgID,
            type: "text",
            text: content,
            time: { start: now, end: now },
          } satisfies Message.TextPart,
          time_created: now,
          time_updated: now,
        })
        .run()
    })

    // 3. Mark session as busy
    await Bus.publish(Bus.SessionStatus, { sessionID: sessionId, status: "busy" })

    // 4. Build system prompt — provider-specific + financial context + skill list
    const financialContext = buildFinancialContext()
    const skills = await Skill.load()
    const skillsContext =
      skills.length > 0
        ? [
            "Skills provide specialized instructions and workflows for specific tasks.",
            "Use the skill tool to load a skill when a task matches its description.",
            Skill.fmt(skills, { verbose: true }),
          ].join("\n")
        : undefined
    const basePrompt = getSystemPrompt(modelId)
    const parts = [basePrompt]
    if (financialContext) parts.push(financialContext)
    if (skillsContext) parts.push(skillsContext)
    const system = parts.join("\n\n")

    let fullText = ""
    let totalInputTokens = 0
    let totalOutputTokens = 0

    const controller = new AbortController()
    abortControllers.set(sessionId, controller)

    try {
      const model = await Provider.getModel(modelId)
      const tools = ToolRegistry.toAITools({ sessionID: sessionId, messageID: assistantMsgID, abort: controller.signal })
      const MAX_STEPS = 25
      // Doom loop detection: track last 3 tool signatures (tool + JSON input)
      const recentToolCalls: string[] = []
      const DOOM_LOOP_THRESHOLD = 3
      let doomLoopDetected = false
      const userContent =
        attachments.length > 0
          ? [
              { type: "text" as const, text: content },
              ...attachments.map((a) => ({
                type: "file" as const,
                data: a.data,
                mediaType: a.mime,
                ...(a.filename ? { filename: a.filename } : {}),
              })),
            ]
          : content
      let lastFinishReason = "stop"

      // 5. Let the AI SDK handle the tool loop natively via maxSteps
      const result = streamText({
        model,
        system,
        messages: [...history, { role: "user" as const, content: userContent }],
        tools,
        toolChoice: "auto",
        stopWhen: stepCountIs(MAX_STEPS),
        abortSignal: controller.signal,
      })

      for await (const part of result.fullStream) {
        if (doomLoopDetected) break

        if (part.type === "start-step") {
          const stepStartPartID = Identifier.ascending("part")
          await Bus.publish(Message.Event.PartUpdated, {
            sessionID: sessionId,
            messageID: assistantMsgID,
            part: {
              id: stepStartPartID,
              sessionID: sessionId,
              messageID: assistantMsgID,
              type: "step-start",
            } satisfies Message.StepStartPart,
          })
        }

        if (part.type === "text-delta") {
          const delta = part.text ?? ""
          if (!delta) continue
          fullText += delta
          yield delta
          // Publish text part with accumulated text — idempotent for TUI (set, not append)
          await Bus.publish(Message.Event.PartUpdated, {
            sessionID: sessionId,
            messageID: assistantMsgID,
            part: {
              id: assistantPartID,
              sessionID: sessionId,
              messageID: assistantMsgID,
              type: "text",
              text: fullText,
              time: { start: now },
            } satisfies Message.TextPart,
          })
        }

        if (part.type === "tool-call") {
          // Doom loop detection: if the same tool+input is called 3 times in a row, abort
          const sig = `${part.toolName}:${JSON.stringify(part.input)}`
          recentToolCalls.push(sig)
          if (recentToolCalls.length > DOOM_LOOP_THRESHOLD) recentToolCalls.shift()
          if (recentToolCalls.length === DOOM_LOOP_THRESHOLD && recentToolCalls.every((s) => s === sig)) {
            log.warn("doom loop detected, breaking", { tool: part.toolName })
            const loopWarning = `\n\n⚠️ Detected repeated identical calls to \`${part.toolName}\`. Stopping to avoid a loop. Please check what went wrong and try a different approach.`
            fullText += loopWarning
            yield loopWarning
            doomLoopDetected = true
          }
        }

        if (part.type === "finish-step") {
          lastFinishReason = part.finishReason
          log.info("step finished", { reason: part.finishReason, fullTextLength: fullText.length })
          const stepFinishPartID = Identifier.ascending("part")
          await Bus.publish(Message.Event.PartUpdated, {
            sessionID: sessionId,
            messageID: assistantMsgID,
            part: {
              id: stepFinishPartID,
              sessionID: sessionId,
              messageID: assistantMsgID,
              type: "step-finish",
              reason: part.finishReason,
            } satisfies Message.StepFinishPart,
          })
        }

        if (part.type === "error") throw (part as any).error
      }

      // Accumulate total token usage across all steps
      try {
        const usage = await result.totalUsage
        totalInputTokens = usage.inputTokens ?? 0
        totalOutputTokens = usage.outputTokens ?? 0
      } catch {}

      log.info("stream completed", {
        lastFinishReason,
        fullTextLength: fullText.length,
        doomLoopDetected,
        totalInputTokens,
        totalOutputTokens,
      })

      // Fallback: if no text was generated after a normal completion, emit a notice
      if (!fullText && !doomLoopDetected && lastFinishReason !== "length") {
        const notice = "[The model ran all tools but did not generate a text response. Please try again or rephrase your request.]"
        fullText += notice
        yield notice
        await Bus.publish(Message.Event.PartUpdated, {
          sessionID: sessionId,
          messageID: assistantMsgID,
          part: {
            id: assistantPartID,
            sessionID: sessionId,
            messageID: assistantMsgID,
            type: "text",
            text: fullText,
            time: { start: now },
          } satisfies Message.TextPart,
        })
      }

      // Notify user if the loop was cut short by context limit
      if (lastFinishReason === "length") {
        const notice =
          "\n\n⚠️ [Context limit reached. The response was cut off. Try a new session or break the request into smaller steps.]"
        fullText += notice
        yield notice
        await Bus.publish(Message.Event.PartUpdated, {
          sessionID: sessionId,
          messageID: assistantMsgID,
          part: {
            id: assistantPartID,
            sessionID: sessionId,
            messageID: assistantMsgID,
            type: "text",
            text: fullText,
            time: { start: now },
          } satisfies Message.TextPart,
        })
      }

      const completedAt = Date.now()

      // 6. Save assistant message metadata + TextPart to DB
      Database.use((db) => {
        db.insert(MessageTable)
          .values({
            id: assistantMsgID,
            session_id: sessionId,
            data: {
              id: assistantMsgID,
              sessionID: sessionId,
              role: "assistant",
              modelID: modelId,
              time: { created: now, completed: completedAt },
              ...(totalInputTokens > 0 || totalOutputTokens > 0
                ? {
                    tokens: {
                      input: totalInputTokens,
                      output: totalOutputTokens,
                      total: totalInputTokens + totalOutputTokens,
                    },
                  }
                : {}),
            } satisfies Message.AssistantInfo,
            time_created: now,
            time_updated: completedAt,
          })
          .run()
        if (fullText) {
          db.insert(PartTable)
            .values({
              id: assistantPartID,
              message_id: assistantMsgID,
              session_id: sessionId,
              data: {
                id: assistantPartID,
                sessionID: sessionId,
                messageID: assistantMsgID,
                type: "text",
                text: fullText,
                time: { start: now, end: completedAt },
              } satisfies Message.TextPart,
              time_created: now,
              time_updated: completedAt,
            })
            .run()
        }
      })
    } catch (err) {
      if ((err as any)?.name !== "AbortError") {
        const error = err instanceof Error ? err.message : String(err)
        log.error("chat error", { error })
        await Bus.publish(Bus.SessionError, { sessionID: sessionId, error })
      }
      throw err
    } finally {
      abortControllers.delete(sessionId)
      await Bus.publish(Bus.SessionStatus, { sessionID: sessionId, status: "idle" })
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function loadHistory(sessionId: string): ModelMessage[] {
    const msgRows = Database.use((db) =>
      db
        .select()
        .from(MessageTable)
        .where(eq(MessageTable.session_id, sessionId))
        .orderBy(MessageTable.time_created)
        .all(),
    )

    return msgRows.flatMap((r) => {
      const info = r.data as Message.Info
      if (info.role !== "user" && info.role !== "assistant") return []
      const parts = Database.use((db) =>
        db.select().from(PartTable).where(eq(PartTable.message_id, r.id)).orderBy(PartTable.time_created).all(),
      )
      const text = parts
        .map((p) => p.data as Message.Part)
        .filter((p): p is Message.TextPart => p.type === "text")
        .map((p) => p.text)
        .join("")
      return [{ role: info.role as "user" | "assistant", content: text }]
    })
  }

  function toInfo(row: typeof SessionTable.$inferSelect): Info {
    return { id: row.id, title: row.title, time: { created: row.time_created, updated: row.time_updated } }
  }
}
