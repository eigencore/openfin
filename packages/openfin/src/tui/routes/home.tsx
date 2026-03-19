import { createSignal, onMount, Show } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useSync } from "../context/sync"
import { useExit } from "../context/exit"
import { useCommandPalette } from "../component/command"
import { useDialog } from "../ui/dialog"
import { Logo, LOGO_HEIGHT, LOGO_WIDTH } from "../component/logo"
import { Installation } from "../../installation"

const TIPS = [
  "Press / to open the command palette",
  "Type /new to start a new session",
  "Type /sessions to browse your history",
  "Type /accounts to view your accounts",
  "Type /budgets to manage budgets",
  "Type /goals to track financial goals",
  "Press Ctrl+C or type /exit to quit",
]

export function HomeRoute() {
  const { theme } = useTheme()
  const dims = useTerminalDimensions()
  const route = useRoute()
  const sync = useSync()
  const { exit } = useExit()
  const { show: showCommands, handleSlashInput } = useCommandPalette()
  const dialog = useDialog()

  const [input, setInput] = createSignal("")
  const [tipIdx, setTipIdx] = createSignal(0)

  // Rotate tips
  onMount(() => {
    const timer = setInterval(() => {
      setTipIdx((i) => (i + 1) % TIPS.length)
    }, 4000)
    return () => clearInterval(timer)
  })

  const logoX = () => Math.max(0, Math.floor((dims().width - LOGO_WIDTH) / 2))
  const logoY = () => Math.max(1, Math.floor((dims().height - LOGO_HEIGHT - 8) / 2))
  const inputY = () => logoY() + LOGO_HEIGHT + 2
  const inputWidth = () => Math.min(60, dims().width - 4)
  const inputX = () => Math.floor((dims().width - inputWidth()) / 2)

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
      // Non-slash input → create session and chat
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
      if (ch === "/" && input() === "") {
        showCommands()
        return true
      }
      setInput((s) => s + ch)
      return true
    }
    return false
  })

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
        left={Math.floor((dims().width - 32) / 2)}
        fg={theme().textMuted}
      >
        AI-powered financial assistant · terminal
      </text>

      {/* Input box */}
      <box
        position="absolute"
        top={inputY()}
        left={inputX()}
        width={inputWidth()}
        height={3}
        backgroundColor={theme().backgroundPanel}
        border={true}
        borderColor={theme().border}
        borderStyle="rounded"
        paddingLeft={2}
      >
        <Show when={!input()}>
          <text fg={theme().textMuted}>Type / for commands or ask anything...</text>
        </Show>
        <Show when={!!input()}>
          <text fg={theme().text}>
            {input()}<span style={{ fg: theme().accent }}>█</span>
          </text>
        </Show>
      </box>

      {/* Tip */}
      <text
        position="absolute"
        top={inputY() + 4}
        left={Math.floor((dims().width - (TIPS[tipIdx()] ?? "").length) / 2)}
        fg={theme().textMuted}
      >
        {TIPS[tipIdx()]}
      </text>

      {/* Footer */}
      <text position="absolute" top={dims().height - 2} left={2} fg={theme().textMuted}>
        {process.cwd()}
      </text>
      <text position="absolute" top={dims().height - 2} left={dims().width - Installation.VERSION.length - 1} fg={theme().textMuted}>
        {Installation.VERSION}
      </text>
    </>
  )
}
