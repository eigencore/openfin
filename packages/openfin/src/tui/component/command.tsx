import { createMemo, createSignal, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createSimpleContext } from "../context/helper"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"

export interface Command {
  id: string
  title: string
  description?: string
  slash?: string
  category?: string
  keybind?: string[]
  action: () => void
}

const CommandContext = createSimpleContext({
  name: "Command",
  init: () => {
    const [state, setState] = createStore<{ commands: Command[] }>({ commands: [] })

    function register(cmd: Command) {
      setState(
        produce((s) => {
          const idx = s.commands.findIndex((c) => c.id === cmd.id)
          if (idx >= 0) s.commands[idx] = cmd
          else s.commands.push(cmd)
        }),
      )
    }

    function all(): Command[] {
      return [...state.commands]
    }

    function findBySlash(slash: string): Command | undefined {
      return state.commands.find((c) => c.slash === slash)
    }

    return { register, all, findBySlash }
  },
})

export const CommandProvider = CommandContext.provider
export const useCommandRegistry = CommandContext.use

// ── Command Palette Dialog ────────────────────────────────────────────────────

function CommandPalette() {
  const registry = useCommandRegistry()
  const { theme } = useTheme()
  const dialog = useDialog()
  const dims = useTerminalDimensions()

  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal(0)

  const filtered = createMemo(() => {
    const q = query().toLowerCase().replace(/^\//, "")
    if (!q) return registry.all()
    return registry.all().filter((c) => {
      return (
        c.title.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.slash?.includes(q)
      )
    })
  })

  const maxVisible = 12
  const width = createMemo(() => Math.min(64, dims().width - 4))
  const left = createMemo(() => Math.floor((dims().width - width()) / 2))
  const top = createMemo(() => Math.floor((dims().height - maxVisible - 6) / 2))

  useKeyboard((key) => {
    if (key.name === "up") {
      setSelected((s) => Math.max(0, s - 1))
      return true
    }
    if (key.name === "down") {
      setSelected((s) => Math.min(filtered().length - 1, s + 1))
      return true
    }
    if (key.name === "return") {
      const cmd = filtered()[selected()]
      if (cmd) {
        dialog.clear()
        cmd.action()
      }
      return true
    }
    if (key.name === "backspace") {
      setQuery((q) => q.slice(0, -1))
      setSelected(0)
      return true
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      setQuery((q) => q + key.sequence)
      setSelected(0)
      return true
    }
    return false
  })

  const visible = createMemo(() => {
    const items = filtered()
    const sel = selected()
    const start = Math.max(0, sel - Math.floor(maxVisible / 2))
    return items.slice(start, start + maxVisible).map((cmd, i) => ({ cmd, idx: start + i }))
  })

  return (
    <box
      position="absolute"
      top={top()}
      left={left()}
      width={width()}
      flexDirection="column"
      backgroundColor={theme().backgroundPanel}
      border={true}
      borderColor={theme().border}
      borderStyle="rounded"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Title */}
      <text fg={theme().textMuted} paddingLeft={1} paddingBottom={1}>
        {"Command Palette (↑↓ navigate · Enter run · Esc close)"}
      </text>

      {/* Input */}
      <box
        width={width() - 4}
        height={1}
        flexDirection="row"
        backgroundColor={theme().backgroundElement}
        paddingLeft={1}
        marginBottom={1}
      >
        <text fg={theme().textMuted}>/</text>
        <text fg={theme().text}>{query()}</text>
        <text fg={theme().accent}>█</text>
      </box>

      {/* Results */}
      <For each={visible()}>
        {({ cmd, idx }) => (
          <box
            width={width() - 4}
            height={1}
            flexDirection="row"
            backgroundColor={idx === selected() ? theme().backgroundElement : undefined}
            paddingLeft={1}
          >
            <text fg={idx === selected() ? theme().accent : theme().text}>
              {cmd.slash ? `/${cmd.slash}` : cmd.title}
            </text>
            <Show when={cmd.description}>
              <text fg={theme().textMuted} marginLeft={2}>
                {cmd.description}
              </text>
            </Show>
          </box>
        )}
      </For>

      <Show when={filtered().length === 0}>
        <text fg={theme().textMuted} paddingLeft={1} paddingTop={1}>
          No commands found
        </text>
      </Show>
    </box>
  )
}

// ── Hook to show command palette ──────────────────────────────────────────────

export function useCommandPalette() {
  const dialog = useDialog()
  const registry = useCommandRegistry()

  function show() {
    dialog.replace({ component: () => <CommandPalette /> })
  }

  function handleSlashInput(input: string): boolean {
    if (!input.startsWith("/")) return false
    const slash = input.slice(1).trim()
    const cmd = registry.findBySlash(slash)
    if (cmd) {
      cmd.action()
      return true
    }
    return false
  }

  return { show, handleSlashInput, registry }
}
