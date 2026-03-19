import { createMemo, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { useKV } from "../../context/kv"
import { Installation } from "../../../installation"

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
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
  const kv = useKV()

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

  const directory = process.cwd()
  const dirParts = directory.split("/")
  const dirParent = dirParts.slice(0, -1).join("/") + "/"
  const dirName = dirParts.at(-1) ?? directory

  const [gettingStartedDismissed, setGettingStartedDismissed] = kv.signal("dismissed_getting_started", false)

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme().backgroundPanel}
        width={42}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
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
              <text fg={theme().text}>
                <b>{title()}</b>
              </text>
            </box>

            {/* Context block */}
            <box>
              <text fg={theme().text}>
                <b>Context</b>
              </text>
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
                <text fg={theme().text}>
                  <b>Session</b>
                </text>
                <text fg={theme().textMuted}>Created {formatDate(session()!.time.created)}</text>
              </box>
            </Show>
          </box>
        </scrollbox>

        {/* Bottom fixed section */}
        <box flexShrink={0} gap={1} paddingTop={1}>
          {/* Getting started card */}
          <Show when={!gettingStartedDismissed()}>
            <box
              backgroundColor={theme().backgroundElement}
              paddingTop={1}
              paddingBottom={1}
              paddingLeft={2}
              paddingRight={2}
              flexDirection="row"
              gap={1}
            >
              <text flexShrink={0} fg={theme().text}>
                ⬖
              </text>
              <box flexGrow={1} gap={1}>
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={theme().text}>
                    <b>Getting started</b>
                  </text>
                  <text fg={theme().textMuted} onMouseDown={() => setGettingStartedDismissed(true)}>
                    ✕
                  </text>
                </box>
                <text fg={theme().textMuted}>OpenFin is your AI-powered financial assistant.</text>
                <text fg={theme().textMuted}>Set ANTHROPIC_API_KEY or OPENAI_API_KEY to get started.</text>
                <box flexDirection="row" gap={1} justifyContent="space-between">
                  <text fg={theme().text}>Go back home</text>
                  <text fg={theme().textMuted}>Ctrl+B</text>
                </box>
              </box>
            </box>
          </Show>

          {/* Directory */}
          <text>
            <span style={{ fg: theme().textMuted }}>{dirParent}</span>
            <span style={{ fg: theme().text }}>{dirName}</span>
          </text>

          {/* Version */}
          <text fg={theme().textMuted}>
            <span style={{ fg: theme().success }}>•</span> <b>Open</b>
            <span style={{ fg: theme().text }}>
              <b>Fin</b>
            </span>{" "}
            <span>{Installation.VERSION}</span>
          </text>
        </box>
      </box>
    </Show>
  )
}
