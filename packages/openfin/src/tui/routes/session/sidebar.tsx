import { createMemo, createResource, For, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { Installation } from "../../../installation"
import { api } from "../../context/sdk"

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function fmt(n: number): string {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatDeltaLabel(deltaDate?: number): string {
  if (deltaDate === undefined) return "vs prev"
  const days = Math.floor((Date.now() - deltaDate) / 86_400_000)
  if (days === 0) return "vs today"
  if (days === 1) return "vs yesterday"
  if (days < 7) return `vs ${days}d ago`
  return `vs ${new Date(deltaDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
}

function progressBar(current: number, target: number, width = 8): string {
  const ratio = Math.min(1, target === 0 ? 0 : current / target)
  const filled = Math.round(ratio * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

// Known context window limits (in tokens) for supported models
const MODEL_CONTEXT_LIMIT: Record<string, number> = {
  "anthropic:claude-opus-4-6": 200_000,
  "anthropic:claude-sonnet-4-5": 200_000,
  "anthropic:claude-haiku-4-5": 200_000,
  "openai:gpt-4o": 128_000,
  "openai:gpt-4o-mini": 128_000,
  "openai:o3-mini": 200_000,
}

interface SidebarProps {
  sessionID: string
  overlay?: boolean
}

export function Sidebar(props: SidebarProps) {
  const { theme } = useTheme()
  const sync = useSync()

  const session = createMemo(() => sync.store.sessions.find((s) => s.id === props.sessionID))
  const title = createMemo(() => session()?.title ?? "New Session")
  const messages = createMemo(() => sync.store.messages[props.sessionID] ?? [])
  const messageCount = createMemo(() => messages().length)

  const context = createMemo(() => {
    const last = [...messages()].reverse().find((m) => m.data.role === "assistant")
    if (!last || last.data.role !== "assistant") return null
    const tokens = last.data.tokens
    if (!tokens) return null
    const limit = MODEL_CONTEXT_LIMIT[last.data.model]
    const percentage = limit ? Math.round((tokens.total / limit) * 100) : null
    return { tokens: tokens.total.toLocaleString(), percentage }
  })

  const isStreaming = createMemo(() => {
    const s = sync.store.streaming[props.sessionID]
    return s && !s.done
  })

  const [dashboard] = createResource(() => api.getDashboard())

  const netWorth = createMemo(() => dashboard()?.netWorth ?? null)
  const budgets = createMemo(() => dashboard()?.budgets ?? [])
  const alerts = createMemo(() => dashboard()?.alerts ?? [])
  const upcoming = createMemo(() => (dashboard()?.upcoming ?? []).slice(0, 3))

  return (
    <Show when={session()}>
      <box
        width={42}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        border={["left"]}
        borderColor={theme().border}
        position={props.overlay ? "absolute" : "relative"}
      >
        <scrollbox
          flexGrow={1}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme().background,
              foregroundColor: theme().borderActive,
            },
          }}
        >
          <box flexShrink={0} gap={1} paddingRight={1}>
            {/* Session title */}
            <box paddingRight={1}>
              <text fg={theme().text}>{title()}</text>
            </box>

            {/* Context block */}
            <box>
              <text fg={theme().accent}>▌ Context</text>
              <Show
                when={context()}
                fallback={<text fg={theme().textMuted}>{messageCount()} messages</text>}
              >
                <text fg={theme().textMuted}>{context()!.tokens} tokens</text>
                <Show when={context()!.percentage !== null}>
                  <text fg={theme().textMuted}>{context()!.percentage}% used</text>
                </Show>
                <text fg={theme().textMuted}>{messageCount()} messages</text>
              </Show>
              <Show when={isStreaming()}>
                <text fg={theme().accent}>responding...</text>
              </Show>
            </box>

            {/* Session info */}
            <Show when={session()}>
              <box>
                <text fg={theme().accent}>▌ Session</text>
                <text fg={theme().textMuted}>Created {formatDate(session()!.time.created)}</text>
              </box>
            </Show>

            {/* Financial snapshot */}
            <Show when={netWorth() !== null}>
              <box>
                <text fg={theme().accent}>▌ Net Worth</text>
                <text>
                  <span style={{ fg: netWorth()!.net_worth >= 0 ? theme().success : theme().error }}>
                    {fmt(netWorth()!.net_worth)}
                  </span>
                  <Show when={netWorth()!.delta !== undefined}>
                    <span style={{ fg: theme().textMuted }}>{"  "}</span>
                    <span style={{ fg: (netWorth()!.delta ?? 0) >= 0 ? theme().success : theme().error }}>
                      {(netWorth()!.delta ?? 0) >= 0 ? "+" : "-"}{fmt(netWorth()!.delta ?? 0)}
                    </span>
                    <span style={{ fg: theme().textMuted }}>{" "}{formatDeltaLabel(netWorth()!.deltaDate)}</span>
                  </Show>
                </text>
              </box>
            </Show>

            {/* Budgets */}
            <Show when={budgets().length > 0}>
              <box>
                <text fg={theme().accent}>▌ Budgets</text>
                <For each={budgets().slice(0, 5)}>
                  {(b) => {
                    const ratio = b.amount === 0 ? 0 : b.spent / b.amount
                    const pct = `${Math.round(ratio * 100)}%`.padStart(4)
                    const bar = progressBar(b.spent, b.amount, 6)
                    const label = truncate(b.category, 10).padEnd(10)
                    const color = ratio >= 1 ? theme().error : ratio >= 0.8 ? theme().warning : theme().success
                    return (
                      <text>
                        <span style={{ fg: theme().textMuted }}>{label}</span>
                        <span style={{ fg: color }}>{" "}{bar}{pct}</span>
                      </text>
                    )
                  }}
                </For>
              </box>
            </Show>

            {/* Alerts summary */}
            <Show when={alerts().length > 0}>
              <box>
                <For each={alerts().slice(0, 3)}>
                  {(a) => (
                    <text fg={a.severity === "critical" ? theme().error : theme().warning}>
                      {a.severity === "critical" ? "✖ " : "~ "}{truncate(a.message, 34)}
                    </text>
                  )}
                </For>
              </box>
            </Show>

            {/* Upcoming bills */}
            <Show when={upcoming().length > 0}>
              <box>
                <text fg={theme().accent}>▌ Upcoming</text>
                <For each={upcoming()}>
                  {(r) => {
                    const date = new Date(r.next_due).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                    const sign = r.type === "expense" ? "-" : "+"
                    const color = r.type === "expense" ? theme().warning : theme().success
                    return (
                      <text>
                        <span style={{ fg: theme().textMuted }}>{date}  </span>
                        <span style={{ fg: color }}>{sign}{fmt(r.amount)}</span>
                      </text>
                    )
                  }}
                </For>
              </box>
            </Show>
          </box>
        </scrollbox>

        {/* Bottom fixed section */}
        <box flexShrink={0} gap={1} paddingTop={1} border={["top"]} borderColor={theme().border}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={theme().textMuted}>Ctrl+B  home</text>
            <text fg={theme().textMuted}>Ctrl+S  sidebar</text>
          </box>
          <text fg={theme().textMuted}>
            <span style={{ fg: theme().success }}>•</span>{" "}
            <span style={{ bold: true }}>Open</span>
            <span style={{ fg: theme().text, bold: true }}>Fin</span>
            {" "}{Installation.VERSION}
          </text>
        </box>
      </box>
    </Show>
  )
}
