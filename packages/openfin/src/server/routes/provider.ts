import { Hono } from "hono"
import { lazy } from "../../util/lazy"

export type ProviderModel = {
  id: string
  name: string
  provider: string
}

const MODELS: ProviderModel[] = [
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic" },
  { id: "gpt-4.1", name: "GPT-4.1", provider: "openai" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai" },
]

export const ProviderRoutes = lazy(() =>
  new Hono().get("/", (c) => {
    return c.json(MODELS)
  }),
)
