import { createSignal, onCleanup } from "solid-js"
import { createSimpleContext } from "./helper"
import type { Message } from "../../session/message"

export const API_BASE = "http://localhost:4096"

export interface SessionInfo {
  id: string
  title: string
  time: { created: number; updated: number }
}

export interface MessageRow {
  id: string
  sessionId: string
  data:
    | { role: "user"; content: string }
    | { role: "assistant"; content: string; model: string; time_completed: number; tokens?: { input: number; output: number; total: number } }
  time: { created: number; updated: number }
}

// ── SSE event types ────────────────────────────────────────────────────────────
// Server sends { type, properties } shape via Bus.publish

export type SSEEvent =
  | { type: "session.status"; properties: { sessionID: string; status: string } }
  | { type: "message.part.updated"; properties: { sessionID: string; messageID: string; part: Message.Part } }
  | { type: "session.error"; properties: { sessionID?: string; error: string } }
  | { type: "server.connected"; properties: Record<string, never> }
  | { type: "server.heartbeat"; properties: Record<string, never> }

// ── SDK client ────────────────────────────────────────────────────────────────

export interface ModelInfo {
  id: string
  name: string
  provider: string
  providerName: string
}

export interface DashboardData {
  netWorth: { assets: number; debts: number; net_worth: number; currency: string; delta?: number; deltaDate?: number }
  netWorthHistory: { date: number; value: number }[]
  topExpenses: { category: string; amount: number }[]
  income: { amount: number; currency: string; notes: string | null } | null
  upcoming: { title: string; amount: number; type: string; category: string; currency: string; next_due: number }[]
  accounts: { name: string; type: string; balance: number; currency: string; institution: string | null; credit_limit: number | null }[]
  debts: { name: string; type: string; balance: number; currency: string; due_day: number | null; interest_rate: number | null; min_payment: number | null }[]
  budgets: { category: string; amount: number; spent: number; currency: string; period: string }[]
  goals: { name: string; target_amount: number; current_amount: number; currency: string; target_date: number | null; time_created: number }[]
  alerts: { type: string; severity: "warning" | "critical"; message: string }[]
}

export const api = {
  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${API_BASE}/provider`)
    if (!res.ok) throw new Error(`listModels: ${res.status}`)
    return res.json()
  },

  async getDashboard(): Promise<DashboardData> {
    const res = await fetch(`${API_BASE}/profile/dashboard`)
    if (!res.ok) throw new Error(`getDashboard: ${res.status}`)
    return res.json()
  },

  async listSessions(): Promise<SessionInfo[]> {
    const res = await fetch(`${API_BASE}/session`)
    if (!res.ok) throw new Error(`listSessions: ${res.status}`)
    return res.json()
  },

  async createSession(title?: string): Promise<SessionInfo> {
    const res = await fetch(`${API_BASE}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error(`createSession: ${res.status}`)
    return res.json()
  },

  async getSession(id: string): Promise<SessionInfo> {
    const res = await fetch(`${API_BASE}/session/${id}`)
    if (!res.ok) throw new Error(`getSession: ${res.status}`)
    return res.json()
  },

  async getMessages(id: string): Promise<MessageRow[]> {
    const res = await fetch(`${API_BASE}/session/${id}/messages`)
    if (!res.ok) throw new Error(`getMessages: ${res.status}`)
    return res.json()
  },

  async getParts(id: string): Promise<Record<string, import("../../session/message").Message.Part[]>> {
    const res = await fetch(`${API_BASE}/session/${id}/parts`)
    if (!res.ok) throw new Error(`getParts: ${res.status}`)
    return res.json()
  },

  async deleteSession(id: string): Promise<void> {
    await fetch(`${API_BASE}/session/${id}`, { method: "DELETE" })
  },

  async renameSession(id: string, title: string): Promise<SessionInfo> {
    const res = await fetch(`${API_BASE}/session/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error(`renameSession: ${res.status}`)
    return res.json()
  },

  async abortSession(sessionId: string): Promise<void> {
    await fetch(`${API_BASE}/session/${sessionId}/abort`, { method: "POST" })
  },

  async runCmd(command: string, args: string[] = []): Promise<string> {
    const res = await fetch(`${API_BASE}/cmd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, args }),
    })
    const data = (await res.json()) as { output?: string; error?: string }
    if (!res.ok || data.error) throw new Error(data.error ?? "Command failed")
    return data.output ?? ""
  },

  async sendMessage(
    sessionId: string,
    content: string,
    model?: string,
    attachments?: { mime: string; data: string; filename?: string }[],
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/session/${sessionId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, model, attachments }),
    })
    if (!res.ok) throw new Error(`sendMessage: ${res.status}`)
  },
}

// ── SDK context ───────────────────────────────────────────────────────────────

type EventListener = (event: SSEEvent) => void

const SDKContext = createSimpleContext({
  name: "SDK",
  init: () => {
    const [connected, setConnected] = createSignal(false)
    const listeners = new Set<EventListener>()

    function subscribe(fn: EventListener) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }

    function emit(event: SSEEvent) {
      for (const fn of listeners) fn(event)
    }

    let abort: AbortController | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    async function connect() {
      abort = new AbortController()
      try {
        const res = await fetch(`${API_BASE}/event`, { signal: abort.signal })
        if (!res.ok || !res.body) throw new Error("SSE connect failed")
        setConnected(true)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split("\n")
          buf = lines.pop() ?? ""
          for (const line of lines) {
            if (line.startsWith("data:")) {
              const data = line.slice(5).trim()
              if (data) {
                try {
                  emit(JSON.parse(data) as SSEEvent)
                } catch {}
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return
      }
      setConnected(false)
      reconnectTimer = setTimeout(connect, 2000)
    }

    connect()

    onCleanup(() => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      abort?.abort()
    })

    return { connected, subscribe, api }
  },
})

export const SDKProvider = SDKContext.provider
export const useSDK = SDKContext.use
