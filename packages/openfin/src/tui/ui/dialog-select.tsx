import { createMemo, createSignal, For, Show } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"

export interface SelectItem {
  label: string
  description?: string
  onSelect: () => void
}

interface DialogSelectProps {
  title: string
  items: SelectItem[]
  onClose?: () => void
}

export function DialogSelect(props: DialogSelectProps) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const dims = useTerminalDimensions()
  const [selected, setSelected] = createSignal(0)

  const maxVisible = 10
  const width = createMemo(() => Math.min(60, dims().width - 4))
  const left = createMemo(() => Math.floor((dims().width - width()) / 2))
  const top = createMemo(() => Math.floor((dims().height - maxVisible - 4) / 2))

  useKeyboard((key) => {
    if (key.name === "up" || (key.name === "k" && !key.ctrl)) {
      setSelected((s) => Math.max(0, s - 1))
      return true
    }
    if (key.name === "down" || (key.name === "j" && !key.ctrl)) {
      setSelected((s) => Math.min(props.items.length - 1, s + 1))
      return true
    }
    if (key.name === "return") {
      const item = props.items[selected()]
      if (item) {
        dialog.pop()
        item.onSelect()
      }
      return true
    }
    return false
  })

  const visible = createMemo(() => {
    const start = Math.max(0, selected() - Math.floor(maxVisible / 2))
    return props.items.slice(start, start + maxVisible).map((item, i) => ({ item, idx: start + i }))
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
      paddingLeft={2}
      paddingRight={1}
    >
      <text fg={theme().textMuted} attributes={TextAttributes.BOLD}>
        {props.title}
      </text>
      <For each={visible()}>
        {({ item, idx }) => (
          <box
            width={width() - 4}
            height={1}
            flexDirection="row"
            backgroundColor={idx === selected() ? theme().backgroundElement : undefined}
            paddingLeft={1}
          >
            <text fg={idx === selected() ? theme().accent : theme().text}>{item.label}</text>
            <Show when={item.description}>
              <text fg={theme().textMuted} marginLeft={2}>
                {item.description}
              </text>
            </Show>
          </box>
        )}
      </For>
    </box>
  )
}
