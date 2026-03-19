// Polyfill sessionStorage for Bun (browser API not available)
const _storage = new Map<string, string>()
;(globalThis as any).sessionStorage = {
  getItem: (k: string) => _storage.get(k) ?? null,
  setItem: (k: string, v: string) => _storage.set(k, v),
  removeItem: (k: string) => _storage.delete(k),
}

import { render } from "@opentui/solid"
import { App } from "./app"
import { Server } from "../server/server"
import { Log } from "../util/log"

// Route server logs to file so they don't bleed into the TUI terminal
await Log.init({ print: false, dev: true })

// Register tools before starting the server
import { ToolRegistry } from "../tool/registry"
import { GetPriceTool } from "../tool/get-price"
import { ProfileTools } from "../tool/profile-tools"

ToolRegistry.register(GetPriceTool, ...ProfileTools)

// Start the HTTP server
Server.listen()

// Give the server a moment to bind, then render the TUI
setTimeout(() => {
  render(() => App(), {
    targetFps: 60,
    exitOnCtrlC: false,
  })
}, 100)
