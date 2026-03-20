import { createResource, createSignal, Show } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useSync } from "../context/sync"
import { useExit } from "../context/exit"
import { useCommandPalette } from "../component/command"
import { useDialog } from "../ui/dialog"
import { Logo, LOGO_HEIGHT, LOGO_WIDTH } from "../component/logo"
import { DashboardPanel } from "../component/dashboard"
import { Installation } from "../../installation"
import { api } from "../context/sdk"

const PANEL_WIDTH = 44
const MIN_WIDTH_FOR_PANEL = 80

export function HomeRoute() {
  const { theme } = useTheme()
  const dims = useTerminalDimensions()
  const route = useRoute()
  const sync = useSync()
  const { exit } = useExit()
  const { show: showCommands, handleSlashInput } = useCommandPalette()
  const dialog = useDialog()

  const [input, setInput] = createSignal("")

  const [dashboard] = createResource(() => api.getDashboard().catch(() => null))

  const showPanel = () => dims().width >= MIN_WIDTH_FOR_PANEL && dashboard() != null

  const leftWidth = () => (showPanel() ? dims().width - PANEL_WIDTH - 1 : dims().width)

  const logoX = () => Math.max(0, Math.floor((leftWidth() - LOGO_WIDTH) / 2))
  const logoY = () => Math.max(1, Math.floor((dims().height - LOGO_HEIGHT - 6) / 2))
  const shortcutsY = () => logoY() + LOGO_HEIGHT + 2
  const promptY = () => shortcutsY() + 2

  const panelX = () => dims().width - PANEL_WIDTH
  const panelH = () => dims().height

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
    <>
      {/* Logo */}
      <Logo x={logoX()} y={logoY()} />

      {/* Tagline */}
      <text
        position="absolute"
        top={logoY() + LOGO_HEIGHT + 1}
        left={logoX()}
        fg={theme().textMuted}
      >
        {"Your AI-powered financial assistant"}
      </text>

      {/* Shortcuts */}
      <text position="absolute" top={shortcutsY()} left={logoX()}>
        <span style={{ fg: theme().accent }}>{"n"}</span>
        <span style={{ fg: theme().textMuted }}>{"  new   "}</span>
        <span style={{ fg: theme().accent }}>{"s"}</span>
        <span style={{ fg: theme().textMuted }}>{"  sessions   "}</span>
        <span style={{ fg: theme().accent }}>{"/"}</span>
        <span style={{ fg: theme().textMuted }}>{"  comandos"}</span>
      </text>

      {/* Minimal prompt */}
      <text position="absolute" top={promptY()} left={logoX()}>
        <span style={{ fg: theme().accent }}>{"❯ "}</span>
        <Show when={!input()}>
          <span style={{ fg: theme().textMuted }}>{"ask anything..."}</span>
        </Show>
        <Show when={!!input()}>
          <span style={{ fg: theme().text }}>{input()}</span>
          <span style={{ fg: theme().accent }}>{"█"}</span>
        </Show>
      </text>

      {/* Financial dashboard panel */}
      <Show when={showPanel()}>
        <DashboardPanel
          data={dashboard()!}
          theme={theme()}
          x={panelX()}
          y={1}
          width={PANEL_WIDTH}
          height={panelH() - 2}
        />
      </Show>

      {/* Footer — version centered */}
      <text
        position="absolute"
        top={dims().height - 1}
        left={Math.floor((leftWidth() - Installation.VERSION.length) / 2)}
        fg={theme().textMuted}
      >
        {Installation.VERSION}
      </text>
    </>
  )
}
