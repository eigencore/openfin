// Polyfill sessionStorage for Bun (browser API not available)
const _storage = new Map<string, string>()
;(globalThis as any).sessionStorage = {
  getItem: (k: string) => _storage.get(k) ?? null,
  setItem: (k: string, v: string) => _storage.set(k, v),
  removeItem: (k: string) => _storage.delete(k),
}

import { render } from "@opentui/solid"
import { App } from "./app"
import { API_BASE } from "./context/sdk"

// Silence all logs — nothing should bleed into the TUI terminal
import { Log } from "../util/log"
await Log.init({ print: false, dev: false })

// Verify server is reachable before rendering
try {
  const res = await fetch(`${API_BASE}/provider`, { signal: AbortSignal.timeout(3000) })
  if (!res.ok) throw new Error(`Server responded with ${res.status}`)
} catch {
  console.error(`\nOpenFin server is not running. Start it first:\n\n  bun run dev\n`)
  process.exit(1)
}

render(() => App(), {
  targetFps: 60,
  exitOnCtrlC: false,
})
