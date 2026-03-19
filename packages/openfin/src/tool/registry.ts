import { tool as aiTool, jsonSchema, type streamText } from "ai"
import z from "zod"
import { Bus } from "../bus"
import { Message } from "../session/message"
import { Identifier } from "../id/id"
import type { Tool } from "./tool"

type AITools = NonNullable<Parameters<typeof streamText>[0]["tools"]>

export namespace ToolRegistry {
  const registry = new Map<string, Tool.Info>()

  /** Register one or more tools. Safe to call multiple times (last write wins). */
  export function register(...tools: Tool.Info[]): void {
    for (const t of tools) registry.set(t.id, t)
  }

  export function list(): Tool.Info[] {
    return Array.from(registry.values())
  }

  export function get(id: string): Tool.Info | undefined {
    return registry.get(id)
  }

  /**
   * Convert registered tools to Vercel AI SDK format.
   *
   * Each execute() is wrapped with Message.Event.PartUpdated publishing so every
   * tool call is observable on the SSE stream without changing individual tool implementations.
   */
  export function toAITools(ctx: Tool.Context): AITools {
    const result: AITools = {}

    for (const t of registry.values()) {
      result[t.id] = aiTool({
        description: t.description,
        inputSchema: jsonSchema(z.toJSONSchema(t.parameters) as any),
        execute: async (args, toolCtx) => {
          const callID = (toolCtx as any)?.toolCallId ?? Identifier.ascending("tool")
          const partID = Identifier.ascending("part")
          const startTime = Date.now()

          await Bus.publish(Message.Event.PartUpdated, {
            sessionID: ctx.sessionID,
            messageID: ctx.messageID,
            part: {
              id: partID,
              sessionID: ctx.sessionID,
              messageID: ctx.messageID,
              type: "tool",
              callID,
              tool: t.id,
              state: {
                status: "running",
                input: args as Record<string, any>,
                time: { start: startTime },
              },
            } satisfies Message.ToolPart,
          })

          try {
            const res = await t.execute(args, ctx)

            await Bus.publish(Message.Event.PartUpdated, {
              sessionID: ctx.sessionID,
              messageID: ctx.messageID,
              part: {
                id: partID,
                sessionID: ctx.sessionID,
                messageID: ctx.messageID,
                type: "tool",
                callID,
                tool: t.id,
                state: {
                  status: "completed",
                  input: args as Record<string, any>,
                  output: res.output,
                  title: res.title,
                  time: { start: startTime, end: Date.now() },
                },
              } satisfies Message.ToolPart,
            })

            // Return only the output string to the LLM
            return res.output
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err)

            await Bus.publish(Message.Event.PartUpdated, {
              sessionID: ctx.sessionID,
              messageID: ctx.messageID,
              part: {
                id: partID,
                sessionID: ctx.sessionID,
                messageID: ctx.messageID,
                type: "tool",
                callID,
                tool: t.id,
                state: {
                  status: "error",
                  input: args as Record<string, any>,
                  error,
                  time: { start: startTime, end: Date.now() },
                },
              } satisfies Message.ToolPart,
            })

            throw err
          }
        },
      })
    }

    return result
  }
}
