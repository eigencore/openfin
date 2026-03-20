/**
 * openfin auth — Manage provider API keys
 *
 * Usage:
 *   bun run auth login              Interactive: select provider + enter key
 *   bun run auth logout             Interactive: select provider to remove
 *   bun run auth list               Show all configured credentials + env vars
 */

import * as prompts from "@clack/prompts"
import path from "path"
import os from "os"
import { Auth } from "../auth/index"
import { ModelsDev } from "../provider/models"
import { Global } from "../global/index"

const [, , command] = process.argv

// Priority order for provider display (same as opencode)
const PRIORITY: Record<string, number> = {
  anthropic: 0,
  openai: 1,
  google: 2,
  groq: 3,
  mistral: 4,
  xai: 5,
  openrouter: 6,
}

async function login() {
  prompts.intro("Add credential")

  await ModelsDev.refresh().catch(() => {})
  const database = await ModelsDev.get()

  const options = Object.values(database)
    .sort((a, b) => (PRIORITY[a.id] ?? 99) - (PRIORITY[b.id] ?? 99) || a.name.localeCompare(b.name))
    .map((p) => ({ label: p.name, value: p.id }))

  const selected = await prompts.select({
    message: "Select provider",
    maxItems: 8,
    options,
  })
  if (prompts.isCancel(selected)) {
    prompts.cancel("Cancelled")
    process.exit(0)
  }

  const key = await prompts.password({
    message: "Enter your API key",
    validate: (x) => (x && x.length > 0 ? undefined : "Required"),
  })
  if (prompts.isCancel(key)) {
    prompts.cancel("Cancelled")
    process.exit(0)
  }

  await Auth.set(selected as string, key as string)
  prompts.outro(`Saved credential for ${database[selected]?.name ?? selected}`)
}

async function logout() {
  prompts.intro("Remove credential")

  const credentials = Object.entries(await Auth.all())
  if (credentials.length === 0) {
    prompts.log.error("No credentials found")
    prompts.outro("Done")
    return
  }

  const database = await ModelsDev.get()
  const selected = await prompts.select({
    message: "Select provider",
    options: credentials.map(([id]) => ({
      label: (database[id]?.name ?? id) + "  (api)",
      value: id,
    })),
  })
  if (prompts.isCancel(selected)) {
    prompts.cancel("Cancelled")
    process.exit(0)
  }

  await Auth.remove(selected)
  prompts.outro(`Removed credential for ${database[selected]?.name ?? selected}`)
}

async function list() {
  const authPath = path.join(Global.Path.data, "auth.json")
  const homedir = os.homedir()
  const displayPath = authPath.startsWith(homedir) ? authPath.replace(homedir, "~") : authPath

  prompts.intro(`Credentials  ${displayPath}`)

  const database = await ModelsDev.get()
  const credentials = Object.entries(await Auth.all())

  if (credentials.length === 0) {
    prompts.log.warn("No credentials saved. Run: openfin auth login")
  } else {
    for (const [id] of credentials) {
      const name = database[id]?.name ?? id
      prompts.log.info(`${name}  api`)
    }
  }

  prompts.outro(`${credentials.length} credential${credentials.length === 1 ? "" : "s"}`)

  // Show active env vars separately (same as opencode)
  const activeEnvVars: Array<{ provider: string; envVar: string }> = []
  for (const [id, provider] of Object.entries(database)) {
    for (const envVar of provider.env) {
      if (process.env[envVar]) {
        activeEnvVars.push({ provider: provider.name ?? id, envVar })
      }
    }
  }

  if (activeEnvVars.length > 0) {
    console.log()
    prompts.intro("Environment")
    for (const { provider, envVar } of activeEnvVars) {
      prompts.log.info(`${provider}  ${envVar}`)
    }
    prompts.outro(`${activeEnvVars.length} environment variable${activeEnvVars.length === 1 ? "" : "s"}`)
  }
}

async function main() {
  switch (command) {
    case "login":
      await login()
      break
    case "logout":
      await logout()
      break
    case "list":
    case "ls":
      await list()
      break
    default:
      console.log(`Usage:
  bun run auth login    Add a provider credential
  bun run auth logout   Remove a provider credential
  bun run auth list     Show configured credentials`)
  }
}

main().catch((err) => {
  prompts.log.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
