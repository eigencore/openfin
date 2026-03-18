/**
 * Message types stored in MessageTable.data (JSON column).
 * Kept minimal for MVP — extend as needed.
 */
export namespace Message {
  export interface User {
    role: "user"
    content: string
  }

  export interface Assistant {
    role: "assistant"
    content: string
    model: string
    time_completed: number
    tokens?: { input: number; output: number }
    error?: string
  }

  export type Data = User | Assistant

  /** Full row as returned from the DB */
  export interface Row {
    id: string
    sessionId: string
    data: Data
    time: { created: number; updated: number }
  }
}
