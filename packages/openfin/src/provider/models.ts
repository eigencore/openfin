import fs from "fs/promises"
import path from "path"
import { Global } from "../global/index"

const CACHE_FILE = path.join(Global.Path.cache, "models.json")
const MODELS_URL = "https://models.dev/api.json"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export namespace ModelsDev {
  export interface Model {
    id: string
    name: string
    cost?: { input: number; output: number }
    limit?: { context: number; output?: number }
    attachment?: boolean
    reasoning?: boolean
    tool_call?: boolean
    modalities?: string[]
    status?: string
  }

  export interface Provider {
    id: string
    name: string
    env: string[]
    npm: string
    models: Record<string, Model>
  }

  export type Data = Record<string, Provider>

  let _dataPromise: Promise<Data> | null = null

  export function get(): Promise<Data> {
    if (!_dataPromise) {
      _dataPromise = load()
      // Background refresh after TTL
      const timer = setInterval(() => {
        _dataPromise = refresh()
      }, CACHE_TTL_MS)
      // Don't keep the process alive just for this
      if (typeof timer === "object" && (timer as any).unref) (timer as any).unref()
    }
    return _dataPromise
  }

  async function load(): Promise<Data> {
    try {
      const stat = await fs.stat(CACHE_FILE)
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        const raw = await fs.readFile(CACHE_FILE, "utf-8")
        return JSON.parse(raw) as Data
      }
    } catch {}
    return refresh()
  }

  export async function refresh(): Promise<Data> {
    try {
      const res = await fetch(MODELS_URL)
      if (!res.ok) throw new Error(`models.dev fetch failed: ${res.status}`)
      const data = (await res.json()) as Data
      await fs.writeFile(CACHE_FILE, JSON.stringify(data), "utf-8")
      return data
    } catch (err) {
      // Fall back to stale cache if available
      try {
        const raw = await fs.readFile(CACHE_FILE, "utf-8")
        return JSON.parse(raw) as Data
      } catch {}
      throw err
    }
  }
}
