import z from "zod"
import { BusEvent } from "../bus/bus-event"

export namespace Message {
  // ── Part base ─────────────────────────────────────────────────────────────

  const PartBase = z.object({
    id: z.string(),
    sessionID: z.string(),
    messageID: z.string(),
  })

  // ── Part types ────────────────────────────────────────────────────────────

  export const TextPart = PartBase.extend({
    type: z.literal("text"),
    text: z.string(),
    time: z
      .object({
        start: z.number(),
        end: z.number().optional(),
      })
      .optional(),
  })
  export type TextPart = z.infer<typeof TextPart>

  export const ToolStatePending = z.object({
    status: z.literal("pending"),
    input: z.record(z.string(), z.any()),
  })

  export const ToolStateRunning = z.object({
    status: z.literal("running"),
    input: z.record(z.string(), z.any()),
    title: z.string().optional(),
    time: z.object({ start: z.number() }),
  })

  export const ToolStateCompleted = z.object({
    status: z.literal("completed"),
    input: z.record(z.string(), z.any()),
    output: z.string(),
    title: z.string(),
    time: z.object({ start: z.number(), end: z.number() }),
  })

  export const ToolStateError = z.object({
    status: z.literal("error"),
    input: z.record(z.string(), z.any()),
    error: z.string(),
    time: z.object({ start: z.number(), end: z.number() }),
  })

  export const ToolState = z.discriminatedUnion("status", [
    ToolStatePending,
    ToolStateRunning,
    ToolStateCompleted,
    ToolStateError,
  ])
  export type ToolState = z.infer<typeof ToolState>

  export const ToolPart = PartBase.extend({
    type: z.literal("tool"),
    callID: z.string(),
    tool: z.string(),
    state: ToolState,
  })
  export type ToolPart = z.infer<typeof ToolPart>

  export const StepStartPart = PartBase.extend({
    type: z.literal("step-start"),
  })
  export type StepStartPart = z.infer<typeof StepStartPart>

  export const StepFinishPart = PartBase.extend({
    type: z.literal("step-finish"),
    reason: z.string(),
  })
  export type StepFinishPart = z.infer<typeof StepFinishPart>

  export const Part = z.discriminatedUnion("type", [TextPart, ToolPart, StepStartPart, StepFinishPart])
  export type Part = z.infer<typeof Part>

  // ── Message info ──────────────────────────────────────────────────────────

  export interface UserInfo {
    id: string
    sessionID: string
    role: "user"
    time: { created: number }
  }

  export interface AssistantInfo {
    id: string
    sessionID: string
    role: "assistant"
    modelID: string
    time: { created: number; completed?: number }
    tokens?: { input: number; output: number; total: number }
    error?: string
  }

  export type Info = UserInfo | AssistantInfo

  export interface WithParts {
    info: Info
    parts: Part[]
  }

  // ── Legacy row shape (used by REST API + TUI) ─────────────────────────────

  export interface Row {
    id: string
    sessionId: string
    data: { role: "user"; content: string } | { role: "assistant"; content: string; model: string; time_completed: number }
    time: { created: number; updated: number }
  }

  // ── Data stored in MessageTable.data ─────────────────────────────────────

  export type Data = UserInfo | AssistantInfo

  // ── Bus events ────────────────────────────────────────────────────────────

  export const Event = {
    PartUpdated: BusEvent.define(
      "message.part.updated",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
        part: Part,
      }),
    ),
  }
}
