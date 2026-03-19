import { onMount } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { useSDK } from "./sdk"
import type { SessionInfo, MessageRow, SSEEvent } from "./sdk"
import type { Message } from "../../session/message"

export interface StreamingState {
  sessionId: string
  content: string
  done: boolean
}

interface SyncStore {
  sessions: SessionInfo[]
  messages: Record<string, MessageRow[]>
  parts: Record<string, Message.Part[]>
  streaming: Record<string, StreamingState>
  loadedSessions: boolean
}

const SyncContext = createSimpleContext({
  name: "Sync",
  init: () => {
    const sdk = useSDK()
    const [store, setStore] = createStore<SyncStore>({
      sessions: [],
      messages: {},
      parts: {},
      streaming: {},
      loadedSessions: false,
    })

    // Load sessions on mount
    onMount(async () => {
      try {
        const sessions = await sdk.api.listSessions()
        setStore("sessions", sessions)
        setStore("loadedSessions", true)
      } catch (err) {
        console.error("Failed to load sessions:", err)
      }
    })

    // Handle SSE events
    sdk.subscribe((event: SSEEvent) => {
      if (event.type === "session.status") {
        const { sessionID, status } = event.properties
        // Refresh sessions list
        sdk.api.listSessions().then((sessions) => {
          setStore("sessions", sessions)
        })
        // When session goes idle, immediately unblock input, then reload messages.
        // Delete streaming state atomically with the message load to avoid a
        // visual gap between the streaming bubble disappearing and the committed
        // assistant message appearing.
        if (status === "idle") {
          setStore(
            produce((s) => {
              if (s.streaming[sessionID]) s.streaming[sessionID].done = true
            }),
          )
          loadMessages(sessionID, (s) => {
            delete s.streaming[sessionID]
          })
        }
      }

      if (event.type === "message.part.updated") {
        const { sessionID, messageID, part } = event.properties
        setStore(
          produce((s) => {
            // Update parts map (upsert by part.id)
            if (part.type === "text" || part.type === "tool") {
              if (!s.parts[messageID]) s.parts[messageID] = []
              const idx = s.parts[messageID].findIndex((p) => p.id === part.id)
              if (idx >= 0) s.parts[messageID][idx] = part
              else s.parts[messageID].push(part)
            }
            // Update streaming text content — only if streaming is active (not done)
            if (part.type === "text") {
              if (s.streaming[sessionID] && !s.streaming[sessionID].done) {
                s.streaming[sessionID].content = part.text
              }
            }
          }),
        )
      }

      if (event.type === "session.error") {
        const { sessionID } = event.properties
        if (sessionID) {
          setStore(
            produce((s) => {
              if (s.streaming[sessionID]) {
                s.streaming[sessionID].done = true
              }
            }),
          )
        }
      }
    })

    async function loadMessages(sessionId: string, after?: (s: SyncStore) => void) {
      try {
        const [messages, partsMap] = await Promise.all([
          sdk.api.getMessages(sessionId),
          sdk.api.getParts(sessionId),
        ])
        // Apply messages, parts, and optional post-load mutation in one produce call
        // so SolidJS fires a single reactive update — no visual gap between steps.
        setStore(produce((s) => {
          s.messages[sessionId] = messages
          for (const [messageId, parts] of Object.entries(partsMap)) {
            s.parts[messageId] = parts
          }
          after?.(s)
        }))
      } catch (err) {
        console.error(`Failed to load messages for ${sessionId}:`, err)
      }
    }

    async function createSession(title?: string): Promise<SessionInfo> {
      const session = await sdk.api.createSession(title)
      setStore("sessions", (prev) => [session, ...prev])
      return session
    }

    async function renameSession(id: string, title: string) {
      const updated = await sdk.api.renameSession(id, title)
      setStore("sessions", (prev) => prev.map((s) => (s.id === id ? updated : s)))
    }

    async function deleteSession(id: string) {
      await sdk.api.deleteSession(id)
      setStore("sessions", (prev) => prev.filter((s) => s.id !== id))
      setStore(
        produce((s) => {
          delete s.messages[id]
          delete s.streaming[id]
          // Clean up parts for all messages in this session (best effort)
          for (const key of Object.keys(s.parts)) {
            if (key.startsWith(id)) delete s.parts[key]
          }
        }),
      )
    }

    async function sendMessage(sessionId: string, content: string, model?: string): Promise<void> {
      // Optimistically add user message
      const userMsg: MessageRow = {
        id: crypto.randomUUID(),
        sessionId,
        data: { role: "user", content },
        time: { created: Date.now(), updated: Date.now() },
      }
      setStore(
        produce((s) => {
          if (!s.messages[sessionId]) s.messages[sessionId] = []
          s.messages[sessionId].push(userMsg)
          // Initialize streaming state — content will be filled by SSE message.part.updated events
          s.streaming[sessionId] = { sessionId, content: "", done: false }
        }),
      )

      try {
        await sdk.api.sendMessage(sessionId, content, model)
        // Server returns 202 immediately; SSE events will drive the rest
      } catch (err) {
        console.error("sendMessage error:", err)
        setStore(
          produce((s) => {
            if (s.streaming[sessionId]) s.streaming[sessionId].done = true
          }),
        )
      }
    }

    async function abortSession(sessionId: string): Promise<void> {
      try {
        await sdk.api.abortSession(sessionId)
      } catch {}
      setStore(
        produce((s) => {
          if (s.streaming[sessionId]) s.streaming[sessionId].done = true
        }),
      )
    }

    return { store, loadMessages, createSession, deleteSession, renameSession, sendMessage, abortSession }
  },
})

export const SyncProvider = SyncContext.provider
export const useSync = SyncContext.use
