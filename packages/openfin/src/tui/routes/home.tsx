import { createMemo, createResource, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useSync } from "../context/sync"
import { useExit } from "../context/exit"
import { useCommandPalette } from "../component/command"
import { useDialog } from "../ui/dialog"
import { api } from "../context/sdk"
import { Installation } from "../../installation"
import { createSignal } from "solid-js"

const fmt = (n: number) =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function formatRelative(ms: number): string {
  const diff = Date.now() - ms
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 7) return `${days}d ago`
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

function formatDeltaLabel(deltaDate?: number): string {
  if (deltaDate === undefined) return "vs prev"
  const days = Math.floor((Date.now() - deltaDate) / 86_400_000)
  if (days === 0) return "vs today"
  if (days === 1) return "vs yesterday"
  if (days < 7) return `vs ${days}d ago`
  return `vs ${new Date(deltaDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

const RIGHT_WIDTH = 30

export function HomeRoute() {
  const { theme } = useTheme()
  const route = useRoute()
  const sync = useSync()
  const { exit } = useExit()
  const { show: showCommands, handleSlashInput } = useCommandPalette()
  const dialog = useDialog()

  const [input, setInput] = createSignal("")
  const [dashboard] = createResource(() => api.getDashboard())

  const recentSessions = createMemo(() =>
    [...sync.store.sessions]
      .sort((a, b) => b.time.updated - a.time.updated)
      .slice(0, 8),
  )

  const netWorth = createMemo(() => dashboard()?.netWorth ?? null)
  const alerts = createMemo(() => dashboard()?.alerts ?? [])

  useKeyboard((key) => {
    if (dialog.isOpen()) return false
    if (key.ctrl && key.name === "c") {
      exit("Goodbye!")
      return true
    }
    if (key.name === "return") {
      const val = input().trim()
      if (!val) return true
      if (handleSlashInput(val)) {
        setInput("")
        return true
      }
      createAndChat(val)
      setInput("")
      return true
    }
    if (key.name === "backspace") {
      setInput((s) => s.slice(0, -1))
      return true
    }
    if (key.sequence && key.sequence.length === 1) {
      const ch = key.sequence
      if (input() === "") {
        if (ch === "/") { showCommands(); return true }
        if (ch === "n") { openNewSession(); return true }
        if (ch === "s") { handleSlashInput("/sessions"); return true }
        if (ch === "d") { route.navigate({ type: "dashboard" }); return true }
      }
      setInput((s) => s + ch)
      return true
    }
    return false
  })

  async function openNewSession() {
    const session = await sync.createSession()
    route.navigate({ type: "session", sessionID: session.id })
  }

  async function createAndChat(content: string) {
    const session = await sync.createSession()
    route.navigate({ type: "session", sessionID: session.id, initialPrompt: content })
  }

  return (
    <box flexDirection="column" height="100%">
      {/* Main area */}
      <box flexDirection="row" flexGrow={1} overflow="hidden">

        {/* ── Left panel ── */}
        <box
          flexGrow={1}
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          gap={1}
          paddingLeft={4}
          paddingRight={4}
        >
          {/* Logo */}
          <box flexShrink={0} flexDirection="column">
            <text fg={theme().accent}>{"◆  O P E N F I N"}</text>
            <text fg={theme().textMuted}>{"────────────────"}</text>
          </box>

          {/* Tagline */}
          <text fg={theme().textMuted}>{"Your AI-powered financial assistant"}</text>

          {/* Net worth snapshot */}
          <Show when={netWorth() !== null}>
            <box flexDirection="column" flexShrink={0} gap={0} alignItems="center">
              <box flexDirection="row" gap={3}>
                <text>
                  <span style={{ fg: netWorth()!.net_worth >= 0 ? theme().success : theme().error }}>
                    {fmt(netWorth()!.net_worth)}
                  </span>
                  <span style={{ fg: theme().textMuted }}>{" net worth"}</span>
                </text>
                <Show when={netWorth()!.delta !== undefined}>
                  <text>
                    <span style={{ fg: (netWorth()!.delta ?? 0) >= 0 ? theme().success : theme().error }}>
                      {(netWorth()!.delta ?? 0) >= 0 ? "+" : "-"}{fmt(netWorth()!.delta ?? 0)}
                    </span>
                    <span style={{ fg: theme().textMuted }}>{" "}{formatDeltaLabel(netWorth()!.deltaDate)}</span>
                  </text>
                </Show>
              </box>
              <Show when={alerts().filter((a) => a.severity === "critical").length > 0}>
                <text fg={theme().error}>
                  {"✖ "}{alerts().filter((a) => a.severity === "critical").length}{" critical alert(s)"}
                </text>
              </Show>
            </box>
          </Show>

          {/* Input prompt */}
          <box flexDirection="row" flexShrink={0} paddingTop={1}>
            <text fg={theme().accent}>{"❯ "}</text>
            <Show when={!input()} fallback={
              <text>
                <span style={{ fg: theme().text }}>{input()}</span>
                <span style={{ fg: theme().accent }}>{"█"}</span>
              </text>
            }>
              <text fg={theme().textMuted}>{"ask anything..."}</text>
            </Show>
          </box>
        </box>

        {/* ── Right panel ── */}
        <box
          width={RIGHT_WIDTH}
          flexDirection="column"
          border={["left"]}
          borderColor={theme().border}
          paddingTop={2}
          paddingBottom={2}
          paddingLeft={2}
          paddingRight={2}
          gap={1}
        >
          {/* Recent sessions */}
          <box flexShrink={0}>
            <text fg={theme().accent}>{"▌ Recent"}</text>
          </box>

          <box flexGrow={1} flexDirection="column" gap={0} overflow="hidden">
            <Show
              when={recentSessions().length > 0}
              fallback={<text fg={theme().textMuted}>{"No sessions yet"}</text>}
            >
              <For each={recentSessions()}>
                {(session) => (
                  <box flexShrink={0} flexDirection="row" justifyContent="space-between" height={1}>
                    <text fg={theme().text}>{truncate(session.title || "New Session", 18)}</text>
                    <text fg={theme().textMuted}>{formatRelative(session.time.updated)}</text>
                  </box>
                )}
              </For>
            </Show>
          </box>

          {/* Shortcuts */}
          <box flexShrink={0} flexDirection="column" gap={0} paddingTop={1} border={["top"]} borderColor={theme().border}>
            <box flexDirection="row" gap={2}>
              <text fg={theme().accent}>{"n"}</text>
              <text fg={theme().textMuted}>{"new"}</text>
            </box>
            <box flexDirection="row" gap={2}>
              <text fg={theme().accent}>{"s"}</text>
              <text fg={theme().textMuted}>{"sessions"}</text>
            </box>
            <box flexDirection="row" gap={2}>
              <text fg={theme().accent}>{"d"}</text>
              <text fg={theme().textMuted}>{"dashboard"}</text>
            </box>
            <box flexDirection="row" gap={2}>
              <text fg={theme().accent}>{"/"}</text>
              <text fg={theme().textMuted}>{"commands"}</text>
            </box>
          </box>
        </box>
      </box>

      {/* Footer */}
      <box flexDirection="row" justifyContent="flex-end" paddingRight={2} flexShrink={0}>
        <text fg={theme().textMuted}>{Installation.VERSION}</text>
      </box>
    </box>
  )
}
