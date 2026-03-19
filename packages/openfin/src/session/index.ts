import { streamText, type ModelMessage } from "ai"
import { Database, eq, desc } from "../storage/db"
import { NotFoundError } from "../storage/db"
import { SessionTable, MessageTable, PartTable } from "./session.sql"
import { Provider } from "../provider/provider"
import { FINANCE_SYSTEM_PROMPT } from "../provider/system"
import { buildFinancialContext } from "../profile/context"
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

  export async function* chat(
    sessionId: string,
    content: string,
    modelId = Provider.defaultModel(),
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

    // 4. Build system prompt — financial context injected fresh on every call
    const financialContext = buildFinancialContext()
    const system = financialContext ? `${FINANCE_SYSTEM_PROMPT}\n\n${financialContext}` : FINANCE_SYSTEM_PROMPT

    let fullText = ""
    let totalInputTokens = 0
    let totalOutputTokens = 0

    const controller = new AbortController()
    abortControllers.set(sessionId, controller)

    try {
      const model = Provider.getModel(modelId)
      const tools = ToolRegistry.toAITools({ sessionID: sessionId, messageID: assistantMsgID, abort: controller.signal })
      // 5. Manual tool loop — each iteration is one LLM step
      const MAX_STEPS = 10
      let stepMessages: ModelMessage[] = [...history, { role: "user" as const, content }]

      for (let step = 0; step < MAX_STEPS; step++) {
        // Publish step-start part
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

        const result = streamText({ model, system, messages: stepMessages, tools, toolChoice: "auto" })

        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            const delta = (part as any).text ?? (part as any).textDelta ?? ""
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
          if (part.type === "error") throw (part as any).error
        }

        const finishReason = await result.finishReason

        // Accumulate token usage across steps
        try {
          const usage = await result.usage
          totalInputTokens += usage.inputTokens ?? 0
          totalOutputTokens += usage.outputTokens ?? 0
        } catch {}

        // Publish step-finish part
        const stepFinishPartID = Identifier.ascending("part")
        await Bus.publish(Message.Event.PartUpdated, {
          sessionID: sessionId,
          messageID: assistantMsgID,
          part: {
            id: stepFinishPartID,
            sessionID: sessionId,
            messageID: assistantMsgID,
            type: "step-finish",
            reason: finishReason,
          } satisfies Message.StepFinishPart,
        })

        if (finishReason !== "tool-calls") break

        const { messages: newMessages } = await result.response
        stepMessages = [...stepMessages, ...newMessages]
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
