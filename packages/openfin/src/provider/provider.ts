import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { type LanguageModel } from "ai"
import z from "zod"
import { NamedError } from "../util/error"

export const ProviderError = NamedError.create(
  "ProviderError",
  z.object({ message: z.string() }),
)

export type SupportedProvider = "anthropic" | "openai"

export interface ModelRef {
  provider: SupportedProvider
  model: string
}

/**
 * Parse "provider:model" strings like "anthropic:claude-sonnet-4-5" or "openai:gpt-4o"
 */
function parseModelRef(modelId: string): ModelRef {
  const sep = modelId.indexOf(":")
  if (sep === -1) {
    throw new ProviderError({ message: `Invalid model ID "${modelId}". Expected format: "provider:model"` })
  }
  const provider = modelId.slice(0, sep) as SupportedProvider
  const model = modelId.slice(sep + 1)
  if (provider !== "anthropic" && provider !== "openai") {
    throw new ProviderError({
      message: `Unsupported provider "${provider}". Supported: anthropic, openai`,
    })
  }
  return { provider, model }
}

export namespace Provider {
  export const DEFAULT_MODEL = "anthropic:claude-sonnet-4-5"

  /**
   * Returns a Vercel AI SDK LanguageModelV2 for the given model ID.
   * Reads API keys from environment variables.
   *
   * @example
   *   const model = Provider.getModel("anthropic:claude-sonnet-4-5")
   *   const model = Provider.getModel("openai:gpt-4o")
   */
  export function getModel(modelId: string = DEFAULT_MODEL): LanguageModel {
    const { provider, model } = parseModelRef(modelId)

    switch (provider) {
      case "anthropic": {
        const apiKey = process.env["ANTHROPIC_API_KEY"]
        if (!apiKey) {
          throw new ProviderError({ message: "ANTHROPIC_API_KEY environment variable is not set" })
        }
        const client = createAnthropic({ apiKey })
        return client(model)
      }

      case "openai": {
        const apiKey = process.env["OPENAI_API_KEY"]
        if (!apiKey) {
          throw new ProviderError({ message: "OPENAI_API_KEY environment variable is not set" })
        }
        const client = createOpenAI({ apiKey })
        return client(model)
      }
    }
  }

  export function list(): Array<{ id: string; name: string; provider: SupportedProvider }> {
    return [
      { id: "anthropic:claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic" },
      { id: "anthropic:claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "anthropic" },
      { id: "anthropic:claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic" },
      { id: "openai:gpt-4o", name: "GPT-4o", provider: "openai" },
      { id: "openai:gpt-4o-mini", name: "GPT-4o Mini", provider: "openai" },
      { id: "openai:o3-mini", name: "o3 Mini", provider: "openai" },
    ]
  }
}
