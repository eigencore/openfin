import { streamText } from "ai"
import { Database, eq, desc } from "../storage/db"
import { SessionTable, MessageTable } from "./session.sql"
import { Provider } from "../provider/provider"
import { FINANCE_SYSTEM_PROMPT } from "../provider/system"
import { Bus } from "../bus/index"
import { type Message } from "./message"

export namespace Session {
  export interface Info {
    id: string
    projectId: string
    title: string
    directory: string
    version: string
    time: { created: number; updated: number }
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  export function create(opts: { title?: string } = {}): Info {
    const now = Date.now()
    const id = crypto.randomUUID()
    const directory = process.cwd()
    const title = opts.title ?? `Chat ${new Date(now).toLocaleString()}`

    Database.use((db) =>
      db
        .insert(SessionTable)
        .values({
          id,
          project_id: directory,
          slug: `session-${id.slice(0, 8)}`,
          directory,
          title,
          version: "0.1.0",
          time_created: now,
          time_updated: now,
        })
        .run(),
    )

    return { id, projectId: directory, title, directory, version: "0.1.0", time: { created: now, updated: now } }
  }

  export function get(id: string): Info {
    const row = Database.use((db) =>
      db.select().from(SessionTable).where(eq(SessionTable.id, id)).limit(1).get(),
    )
    if (!row) throw new Error(`Session not found: ${id}`)
    return toInfo(row)
  }

  export function list(): Info[] {
    const rows = Database.use((db) =>
      db.select().from(SessionTable).orderBy(desc(SessionTable.time_created)).all(),
    )
    return rows.map(toInfo)
  }

  export function remove(id: string): void {
    Database.use((db) => db.delete(SessionTable).where(eq(SessionTable.id, id)).run())
  }

  export function messages(sessionId: string): Message.Row[] {
    const rows = Database.use((db) =>
      db
        .select()
        .from(MessageTable)
        .where(eq(MessageTable.session_id, sessionId))
        .orderBy(MessageTable.time_created)
        .all(),
    )
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      data: r.data as Message.Data,
      time: { created: r.time_created, updated: r.time_updated },
    }))
  }

  // ── LLM Streaming ─────────────────────────────────────────────────────────

  /**
   * Send a message to the LLM and stream the response.
   * Yields text chunks as they arrive.
   * Saves both user and assistant messages to the DB.
   * Publishes Bus events for each chunk.
   */
  export async function* chat(
    sessionId: string,
    content: string,
    modelId = Provider.DEFAULT_MODEL,
  ): AsyncGenerator<string> {
    const now = Date.now()
    const userMsgId = crypto.randomUUID()
    const assistantMsgId = crypto.randomUUID()

    // 1. Save user message
    Database.use((db) =>
      db
        .insert(MessageTable)
        .values({
          id: userMsgId,
          session_id: sessionId,
          data: { role: "user", content } satisfies Message.User,
          time_created: now,
          time_updated: now,
        })
        .run(),
    )

    // 2. Mark session as busy
    await Bus.publish(Bus.SessionStatus, { sessionID: sessionId, status: "busy" })

    // 3. Build conversation history for the model
    const history = loadHistory(sessionId)

    const model = Provider.getModel(modelId)
    let fullText = ""

    try {
      const result = streamText({
        model,
        system: FINANCE_SYSTEM_PROMPT,
        messages: [...history, { role: "user" as const, content }],
      })

      // 4. Stream chunks to caller and Bus
      for await (const chunk of result.textStream) {
        fullText += chunk
        yield chunk
        await Bus.publish(Bus.MessagePartUpdated, {
          sessionID: sessionId,
          messageID: assistantMsgId,
          delta: chunk,
        })
      }

      // 5. Collect final usage (ai v5 uses inputTokens/outputTokens)
      const usage = await result.usage
      const completedAt = Date.now()
      const tokens =
        usage != null
          ? {
              input: (usage as any).inputTokens ?? (usage as any).promptTokens ?? 0,
              output: (usage as any).outputTokens ?? (usage as any).completionTokens ?? 0,
            }
          : undefined

      // 6. Save assistant message
      Database.use((db) =>
        db
          .insert(MessageTable)
          .values({
            id: assistantMsgId,
            session_id: sessionId,
            data: {
              role: "assistant",
              content: fullText,
              model: modelId,
              time_completed: completedAt,
              tokens,
            } satisfies Message.Assistant,
            time_created: now,
            time_updated: completedAt,
          })
          .run(),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await Bus.publish(Bus.SessionError, { sessionID: sessionId, error: message })
      throw err
    } finally {
      await Bus.publish(Bus.SessionStatus, { sessionID: sessionId, status: "idle" })
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function loadHistory(sessionId: string): Array<{ role: "user" | "assistant"; content: string }> {
    const rows = Database.use((db) =>
      db
        .select()
        .from(MessageTable)
        .where(eq(MessageTable.session_id, sessionId))
        .orderBy(MessageTable.time_created)
        .all(),
    )
    return rows
      .map((r) => r.data as Message.Data)
      .filter((d): d is Message.User | Message.Assistant => d.role === "user" || d.role === "assistant")
      .map((d) => ({ role: d.role, content: d.content }))
  }

  function toInfo(row: typeof SessionTable.$inferSelect): Info {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      directory: row.directory,
      version: row.version,
      time: { created: row.time_created, updated: row.time_updated },
    }
  }
}
