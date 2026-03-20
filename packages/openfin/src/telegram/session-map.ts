/**
 * Persists chatId → { sessionId, date } mapping in ~/.openfin/telegram-sessions.json
 * A new session is automatically created each calendar day.
 */

import fs from "fs/promises"
import path from "path"
import { Global } from "../global/index"

const FILE = path.join(Global.Path.data, "telegram-sessions.json")

interface Entry {
  sessionId: string
  date: string // YYYY-MM-DD
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function load(): Promise<Record<string, Entry>> {
  try {
    const raw = await fs.readFile(FILE, "utf-8")
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function save(data: Record<string, Entry>) {
  await fs.mkdir(path.dirname(FILE), { recursive: true })
  await fs.writeFile(FILE, JSON.stringify(data, null, 2))
}

export const SessionMap = {
  /** Returns the current session ID only if it belongs to today; undefined otherwise. */
  async get(chatId: number): Promise<string | undefined> {
    const data = await load()
    const entry = data[String(chatId)]
    if (!entry || entry.date !== today()) return undefined
    return entry.sessionId
  },

  async set(chatId: number, sessionId: string): Promise<void> {
    const data = await load()
    data[String(chatId)] = { sessionId, date: today() }
    await save(data)
  },

  async delete(chatId: number): Promise<void> {
    const data = await load()
    delete data[String(chatId)]
    await save(data)
  },

  /** Returns all known chat IDs regardless of date. */
  async listChats(): Promise<number[]> {
    const data = await load()
    return Object.keys(data).map(Number).filter(Boolean)
  },
}
