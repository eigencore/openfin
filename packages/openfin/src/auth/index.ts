import fs from "fs/promises"
import path from "path"
import { Global } from "../global/index"

const AUTH_FILE = path.join(Global.Path.data, "auth.json")

interface AuthEntry {
  type: "api"
  key: string
}

export namespace Auth {
  async function readAll(): Promise<Record<string, AuthEntry>> {
    try {
      const raw = await fs.readFile(AUTH_FILE, "utf-8")
      return JSON.parse(raw) as Record<string, AuthEntry>
    } catch {
      return {}
    }
  }

  export async function all(): Promise<Record<string, AuthEntry>> {
    return readAll()
  }

  export async function get(providerId: string): Promise<string | undefined> {
    const all = await readAll()
    return all[providerId]?.key
  }

  export async function set(providerId: string, key: string): Promise<void> {
    const all = await readAll()
    all[providerId] = { type: "api", key }
    await fs.writeFile(AUTH_FILE, JSON.stringify(all, null, 2), { mode: 0o600 })
  }

  export async function remove(providerId: string): Promise<void> {
    const all = await readAll()
    delete all[providerId]
    await fs.writeFile(AUTH_FILE, JSON.stringify(all, null, 2), { mode: 0o600 })
  }
}
