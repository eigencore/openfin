import { Database, eq, asc } from "../storage/db"
import { TodoTable } from "./session.sql"
import z from "zod"

export namespace Todo {
  export const Info = z.object({
    content: z.string().describe("Brief description of the task"),
    status: z
      .enum(["pending", "in_progress", "completed", "cancelled"])
      .describe("Current status of the task"),
    priority: z.enum(["high", "medium", "low"]).describe("Priority level of the task"),
  })

  export type Info = z.infer<typeof Info>

  /** Replace the entire todo list for a session (full overwrite, ordered by position). */
  export function update(input: { sessionID: string; todos: Info[] }): void {
    const now = Date.now()
    Database.transaction((db) => {
      db.delete(TodoTable).where(eq(TodoTable.session_id, input.sessionID)).run()
      if (input.todos.length === 0) return
      db.insert(TodoTable)
        .values(
          input.todos.map((todo, position) => ({
            session_id: input.sessionID,
            content: todo.content,
            status: todo.status,
            priority: todo.priority,
            position,
            time_created: now,
            time_updated: now,
          })),
        )
        .run()
    })
  }

  /** Read current todos for a session, ordered by position. */
  export function get(sessionID: string): Info[] {
    return Database.use((db) =>
      db
        .select()
        .from(TodoTable)
        .where(eq(TodoTable.session_id, sessionID))
        .orderBy(asc(TodoTable.position))
        .all(),
    ).map((row) => ({
      content: row.content,
      status: row.status as Info["status"],
      priority: row.priority as Info["priority"],
    }))
  }
}
