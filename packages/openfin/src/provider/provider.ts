import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createGroq } from "@ai-sdk/groq"
import { createMistral } from "@ai-sdk/mistral"
import { createXai } from "@ai-sdk/xai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { type LanguageModel } from "ai"
import z from "zod"
import { NamedError } from "../util/error"
import { Auth } from "../auth/index"
import { ModelsDev } from "./models"

export const ProviderError = NamedError.create(
  "ProviderError",
  z.object({ message: z.string() }),
)

export interface ModelInfo {
  id: string
  name: string
  provider: string
  providerName: string
}

// Map npm package name → AI SDK factory function
const BUNDLED_PROVIDERS: Record<string, (opts: { apiKey: string }) => (modelId: string) => LanguageModel> = {
  "@ai-sdk/anthropic": createAnthropic as any,
  "@ai-sdk/openai": createOpenAI as any,
  "@ai-sdk/google": createGoogleGenerativeAI as any,
  "@ai-sdk/groq": createGroq as any,
  "@ai-sdk/mistral": createMistral as any,
  "@ai-sdk/xai": createXai as any,
  "@openrouter/ai-sdk-provider": createOpenRouter as any,
}

// Cache SDK clients by "providerId:apiKey" — avoids re-creating on every getModel() call
const clientCache = new Map<string, (modelId: string) => LanguageModel>()

export namespace Provider {
  /**
   * Returns a default model based on available API keys.
   * Sync — only checks env vars, no I/O.
   */
  export function defaultModel(): string {
    if (process.env["ANTHROPIC_API_KEY"]) return "anthropic:claude-sonnet-4-5"
    if (process.env["OPENAI_API_KEY"]) return "openai:gpt-4o"
    if (process.env["GOOGLE_GENERATIVE_AI_API_KEY"]) return "google:gemini-2.0-flash"
    if (process.env["GROQ_API_KEY"]) return "groq:llama-3.3-70b-versatile"
    return "anthropic:claude-sonnet-4-5" // will fail at call time with a clear error
  }

  /**
   * Returns a Vercel AI SDK LanguageModel for the given model ID.
   * Resolves the API key from environment variables or ~/.openfin/auth.json.
   */
  export async function getModel(modelId: string = defaultModel()): Promise<LanguageModel> {
    const sep = modelId.indexOf(":")
    if (sep === -1) {
      throw new ProviderError({ message: `Invalid model ID "${modelId}". Expected "provider:model"` })
    }
    const providerId = modelId.slice(0, sep)
    const modelName = modelId.slice(sep + 1)

    const data = await ModelsDev.get()
    const providerData = data[providerId]
    if (!providerData) {
      throw new ProviderError({ message: `Unknown provider "${providerId}"` })
    }

    const factory = BUNDLED_PROVIDERS[providerData.npm]
    if (!factory) {
      throw new ProviderError({ message: `No bundled SDK for "${providerData.npm}"` })
    }

    const apiKey = await resolveApiKey(providerId, providerData.env)
    if (!apiKey) {
      const envVarList = providerData.env.join(", ")
      throw new ProviderError({
        message: `No API key found for "${providerId}". Set ${envVarList} or run: openfin auth set ${providerId} <key>`,
      })
    }

    const cacheKey = `${providerId}:${apiKey}`
    if (!clientCache.has(cacheKey)) {
      clientCache.set(cacheKey, factory({ apiKey }))
    }
    return clientCache.get(cacheKey)!(modelName)
  }

  /**
   * Lists all models available from bundled providers.
   * Filters to providers that have an API key configured.
   */
  export async function list(): Promise<ModelInfo[]> {
    const data = await ModelsDev.get()
    const result: ModelInfo[] = []

    for (const [providerId, provider] of Object.entries(data)) {
      if (!BUNDLED_PROVIDERS[provider.npm]) continue
      const apiKey = await resolveApiKey(providerId, provider.env)
      if (!apiKey) continue
      for (const [modelId, model] of Object.entries(provider.models)) {
        if (model.status && model.status !== "active") continue
        result.push({
          id: `${providerId}:${modelId}`,
          name: model.name,
          provider: providerId,
          providerName: provider.name,
        })
      }
    }

    return result
  }

  /**
   * Lists only providers that have a key configured (env var or auth.json).
   */
  export async function configuredProviders(): Promise<string[]> {
    const data = await ModelsDev.get()
    const configured: string[] = []
    for (const [providerId, provider] of Object.entries(data)) {
      if (!BUNDLED_PROVIDERS[provider.npm]) continue
      const key = await resolveApiKey(providerId, provider.env)
      if (key) configured.push(providerId)
    }
    return configured
  }

  async function resolveApiKey(providerId: string, envVars: string[]): Promise<string | undefined> {
    for (const envVar of envVars) {
      const val = process.env[envVar]
      if (val) return val
    }
    return Auth.get(providerId)
  }
}
