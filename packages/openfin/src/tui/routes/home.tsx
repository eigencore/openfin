import { createSignal, Show } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useSync } from "../context/sync"
import { useExit } from "../context/exit"
import { useCommandPalette } from "../component/command"
import { useDialog } from "../ui/dialog"
import { Logo, LOGO_HEIGHT, LOGO_WIDTH } from "../component/logo"
import { Installation } from "../../installation"

export function HomeRoute() {
  const { theme } = useTheme()
  const dims = useTerminalDimensions()
  const route = useRoute()
  const sync = useSync()
  const { exit } = useExit()
  const { show: showCommands, handleSlashInput } = useCommandPalette()
  const dialog = useDialog()

  const [input, setInput] = createSignal("")

  // "n  new   s  sessions   d  dashboard   /  comandos"
  const SHORTCUTS_WIDTH = 49
  const TAGLINE = "Your AI-powered financial assistant"
  // Center the whole block using the widest element (shortcuts)
  const contentX = () => Math.max(0, Math.floor((dims().width - SHORTCUTS_WIDTH) / 2))
  const logoX = () => contentX() + Math.floor((SHORTCUTS_WIDTH - LOGO_WIDTH) / 2)
  const taglineX = () => contentX() + Math.floor((SHORTCUTS_WIDTH - TAGLINE.length) / 2)
  const logoY = () => Math.max(1, Math.floor((dims().height - LOGO_HEIGHT - 6) / 2))
  const shortcutsY = () => logoY() + LOGO_HEIGHT + 2
  const promptY = () => shortcutsY() + 2

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
    <>
      {/* Logo */}
      <Logo x={logoX()} y={logoY()} />

      {/* Tagline */}
      <text
        position="absolute"
        top={logoY() + LOGO_HEIGHT + 1}
        left={taglineX()}
        fg={theme().textMuted}
      >
        {"Your AI-powered financial assistant"}
      </text>

      {/* Shortcuts */}
      <text position="absolute" top={shortcutsY()} left={contentX()}>
        <span style={{ fg: theme().accent }}>{"n"}</span>
        <span style={{ fg: theme().textMuted }}>{"  new   "}</span>
        <span style={{ fg: theme().accent }}>{"s"}</span>
        <span style={{ fg: theme().textMuted }}>{"  sessions   "}</span>
        <span style={{ fg: theme().accent }}>{"d"}</span>
        <span style={{ fg: theme().textMuted }}>{"  dashboard   "}</span>
        <span style={{ fg: theme().accent }}>{"/"}</span>
        <span style={{ fg: theme().textMuted }}>{"  comandos"}</span>
      </text>

      {/* Minimal prompt */}
      <text position="absolute" top={promptY()} left={contentX()}>
        <span style={{ fg: theme().accent }}>{"❯ "}</span>
        <Show when={!input()}>
          <span style={{ fg: theme().textMuted }}>{"ask anything..."}</span>
        </Show>
        <Show when={!!input()}>
          <span style={{ fg: theme().text }}>{input()}</span>
          <span style={{ fg: theme().accent }}>{"█"}</span>
        </Show>
      </text>

      {/* Footer — version centered */}
      <text
        position="absolute"
        top={dims().height - 1}
        left={Math.floor((dims().width - Installation.VERSION.length) / 2)}
        fg={theme().textMuted}
      >
        {Installation.VERSION}
      </text>
    </>
  )
}
