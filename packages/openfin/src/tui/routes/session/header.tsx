import { createMemo, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { SplitBorder } from "../../component/border"
import { useModel } from "../../component/dialog-model"
import { Provider } from "@/provider/provider"

interface SessionHeaderProps {
  sessionID: string
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function SessionHeader(props: SessionHeaderProps) {
  const { theme } = useTheme()
  const sync = useSync()
  const dims = useTerminalDimensions()
  const [selectedModel] = useModel()

  const session = createMemo(() => sync.store.sessions.find((s) => s.id === props.sessionID))
  const title = createMemo(() => session()?.title ?? "New Session")
  const narrow = createMemo(() => dims().width < 80)

  const modelName = createMemo(() => {
    const id = selectedModel()
    return Provider.list().find((m) => m.id === id)?.name ?? id
  })

  const tokenInfo = createMemo(() => {
    const messages = sync.store.messages[props.sessionID] ?? []
    const last = [...messages].reverse().find((m) => m.data.role === "assistant")
    if (!last || last.data.role !== "assistant") return null
    const tokens = last.data.tokens
    if (!tokens) return null
    return formatTokens(tokens.total)
  })

  return (
    <box flexShrink={0}>
      <box
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={1}
        border={["left"]}
        customBorderChars={SplitBorder.customBorderChars}
        borderColor={theme().border}
        flexShrink={0}
        backgroundColor={theme().backgroundPanel}
      >
        <box flexDirection={narrow() ? "column" : "row"} justifyContent="space-between" gap={1}>
          <text fg={theme().text}>
            <span style={{ bold: true }}>#</span> <span style={{ bold: true }}>{title()}</span>
          </text>
          <box flexDirection="row" gap={2} flexShrink={0}>
            <Show when={tokenInfo()}>
              <text fg={theme().textMuted} wrapMode="none">
                {tokenInfo()} tokens
              </text>
            </Show>
            <text fg={theme().textMuted} wrapMode="none">
              {modelName()}
            </text>
          </box>
        </box>
      </box>
    </box>
  )
}
