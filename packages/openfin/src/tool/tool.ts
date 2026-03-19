import type { ZodType } from "zod"
import type z from "zod"

export namespace Tool {
  /**
   * Runtime context injected into every tool's execute().
   * Mirrors opencode's Tool.Context — extend here when adding permissions,
   * agent info, etc.
   */
  export interface Context {
    /** ID of the session that triggered this tool call */
    sessionID: string
    /** ID of the assistant message being constructed */
    messageID: string
    /** AbortSignal — honour this in long-running operations */
    abort: AbortSignal
  }

  /**
   * What every tool execute() must return.
   * - `output`   → sent back to the LLM as the tool result string
   * - `title`    → human-readable label (TUI, DB storage)
   * - `metadata` → arbitrary structured data for storage / display
   */
  export interface Result {
    title: string
    output: string
    metadata?: Record<string, unknown>
  }

  export interface Info<Parameters extends ZodType = ZodType> {
    id: string
    description: string
    parameters: Parameters
    execute(args: z.infer<Parameters>, ctx: Context): Promise<Result>
  }

  /**
   * Define a tool. Keeps id co-located with the implementation.
   *
   * @example
   * export const GetPriceTool = Tool.define("get_price", {
   *   description: "Fetch the current price of a stock symbol",
   *   parameters: z.object({ symbol: z.string() }),
   *   async execute({ symbol }, ctx) {
   *     return { title: `Price of ${symbol}`, output: "150.23" }
   *   },
   * })
   */
  export function define<Parameters extends ZodType>(
    id: string,
    def: Omit<Info<Parameters>, "id">,
  ): Info<Parameters> {
    return { id, ...def }
  }
}
