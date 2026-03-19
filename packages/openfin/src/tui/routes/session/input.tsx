import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { TextareaRenderable, type KeyBinding } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { usePromptHistory } from "../../context/prompt-history"
import { EmptyBorder } from "../../component/border"
import { useCommandPalette, useCommandRegistry } from "../../component/command"
import { useModel } from "../../component/dialog-model"
import { Spinner } from "../../component/spinner"
import { Provider } from "@/provider/provider"

interface SessionInputProps {
  sessionID: string
}

export function SessionInput(props: SessionInputProps) {
  const { theme } = useTheme()
  const sync = useSync()
  const { handleSlashInput, show: showPalette } = useCommandPalette()
  const registry = useCommandRegistry()
  const [selectedModel] = useModel()
  let input: TextareaRenderable

  const history = usePromptHistory()
  const [value, setValue] = createSignal("")
  const [sending, setSending] = createSignal(false)
  const [selectedIdx, setSelectedIdx] = createSignal(0)

  const isStreaming = createMemo(() => {
    const s = sync.store.streaming[props.sessionID]
    return s && !s.done
  })

  const highlight = createMemo(() => (isStreaming() ? theme().accent : theme().border))

  const isSlashMode = createMemo(() => value().startsWith("/"))
  const slashQuery = createMemo(() => value().slice(1).toLowerCase())

  const suggestions = createMemo((): ReturnType<typeof registry.all> => {
    if (!isSlashMode()) return []
    const q = slashQuery()
    const all = registry.all()
    if (!q) return all.slice(0, 8)
    return all
      .filter(
        (c) =>
          c.slash?.startsWith(q) ||
          c.title.toLowerCase().startsWith(q) ||
          c.description?.toLowerCase().includes(q),
      )
      .slice(0, 8)
  })

  createEffect(() => {
    slashQuery()
    setSelectedIdx(0)
  })

  useKeyboard((key) => {
    if (key.name === "escape" && isStreaming()) {
      sync.abortSession(props.sessionID)
      return true
    }
    return false
  })

  const modelName = createMemo(() => {
    const id = selectedModel()
    return Provider.list().find((m) => m.id === id)?.name ?? id
  })

  async function submit() {
    const val = value().trim()
    if (!val) return

    if (isSlashMode()) {
      if (val === "/") {
        showPalette()
        setValue("")
        input?.clear()
        return
      }

      // Try exact slash match first
      const handled = handleSlashInput(val)
      if (handled) {
        setValue("")
        input?.clear()
        return
      }

      // No exact match — execute selected suggestion if available
      const cmds = suggestions()
      if (cmds.length > 0) {
        const cmd = cmds[selectedIdx()] ?? cmds[0]
        if (cmd) {
          cmd.action()
          setValue("")
          input?.clear()
          return
        }
      }

      // Nothing matched — open palette
      showPalette()
      setValue("")
      input?.clear()
      return
    }

    if (sending() || isStreaming()) return

    history.append({ input: val })
    setValue("")
    input?.clear()
    setSending(true)
    sync.sendMessage(props.sessionID, val, selectedModel()).finally(() => setSending(false))
  }

  return (
    <box flexDirection="column">
      {/* Inline slash command suggestions */}
      <Show when={isSlashMode() && suggestions().length > 0}>
        <box
          flexDirection="column"
          flexShrink={0}
          border={["left"]}
          borderColor={highlight()}
          customBorderChars={{ ...EmptyBorder, vertical: "┃" }}
          paddingLeft={4}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          backgroundColor={theme().backgroundPanel}
        >
          <For each={suggestions()}>
            {(cmd, i) => (
              <box height={1} flexDirection="row" gap={2}>
                <text fg={i() === selectedIdx() ? theme().accent : theme().text}>
                  /{cmd.slash ?? cmd.title.toLowerCase()}
                </text>
                <Show when={cmd.description}>
                  <text fg={theme().textMuted}>{cmd.description}</text>
                </Show>
              </box>
            )}
          </For>
        </box>
      </Show>

      <box
        border={["left"]}
        borderColor={highlight()}
        customBorderChars={{
          ...EmptyBorder,
          vertical: "┃",
          bottomLeft: "╹",
        }}
      >
        <box
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          flexShrink={0}
          backgroundColor={theme().backgroundElement}
          flexGrow={1}
        >
          <textarea
            placeholder="Ask anything..."
            textColor={theme().text}
            focusedTextColor={theme().text}
            backgroundColor={theme().backgroundElement}
            focusedBackgroundColor={theme().backgroundElement}
            minHeight={1}
            maxHeight={6}
            keyBindings={[
              { name: "return", action: "submit" },
              { name: "return", meta: true, action: "newline" },
            ] satisfies KeyBinding[]}
            onContentChange={() => { setValue(input?.plainText ?? "") }}
            onKeyDown={(e) => {
              if (e.ctrl && e.name === "u") {
                setValue("")
                input?.clear()
                e.preventDefault()
                return
              }
              // In slash mode: intercept up/down/escape for suggestion navigation
              if (isSlashMode() && suggestions().length > 0) {
                if (e.name === "up") {
                  setSelectedIdx((s) => Math.max(0, s - 1))
                  e.preventDefault()
                  return
                }
                if (e.name === "down") {
                  setSelectedIdx((s) => Math.min(suggestions().length - 1, s + 1))
                  e.preventDefault()
                  return
                }
                if (e.name === "escape") {
                  setValue("")
                  input?.clear()
                  e.preventDefault()
                  return
                }
                // All other keys (including Enter) fall through to default handling
              }
              // History navigation
              if (e.name === "up" && !e.ctrl && !e.shift) {
                const entry = history.move(-1, value())
                if (entry !== undefined) {
                  setValue(entry.input)
                  input?.clear()
                  if (entry.input) input?.insertText(entry.input)
                  e.preventDefault()
                }
                return
              }
              if (e.name === "down" && !e.ctrl && !e.shift) {
                const entry = history.move(1, value())
                if (entry !== undefined) {
                  setValue(entry.input)
                  input?.clear()
                  if (entry.input) input?.insertText(entry.input)
                  e.preventDefault()
                }
                return
              }
            }}
            onSubmit={submit}
            ref={(r: TextareaRenderable) => {
              input = r
              r?.focus()
            }}
          />
          <box flexDirection="row" flexShrink={0} paddingTop={1} gap={1} alignItems="center">
            <text fg={theme().accent}>OpenFin </text>
            <Show
              when={isStreaming()}
              fallback={<text fg={theme().textMuted}>ready</text>}
            >
              <Spinner color={theme().accent}>responding</Spinner>
            </Show>
            <text fg={theme().textMuted}>·</text>
            <text fg={theme().textMuted}>{modelName()}</text>
            <Show when={isStreaming()}>
              <text fg={theme().textMuted}>·</text>
              <text fg={theme().text}>Esc <span style={{ fg: theme().textMuted }}>interrupt</span></text>
            </Show>
          </box>
        </box>
      </box>
      <box
        height={1}
        border={["left"]}
        borderColor={highlight()}
        customBorderChars={{
          ...EmptyBorder,
          vertical: "╹",
        }}
      >
        <box
          height={1}
          border={["bottom"]}
          borderColor={theme().backgroundElement}
          customBorderChars={{
            ...EmptyBorder,
            horizontal: "▀",
          }}
        />
      </box>
    </box>
  )
}
