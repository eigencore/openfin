import { TextareaRenderable } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"
import { onMount, type JSX } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo } from "solid-js"

export type DialogPromptProps = {
  title: string
  description?: () => JSX.Element
  placeholder?: string
  value?: string
  onConfirm?: (value: string) => void
  onCancel?: () => void
}

export function DialogPrompt(props: DialogPromptProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const dims = useTerminalDimensions()
  let textarea: TextareaRenderable

  const width = createMemo(() => Math.min(60, dims().width - 4))
  const left = createMemo(() => Math.floor((dims().width - width()) / 2))
  const top = createMemo(() => Math.floor(dims().height / 3))

  onMount(() => {
    setTimeout(() => {
      textarea?.focus()
    }, 1)
  })

  function confirm() {
    const val = textarea?.plainText ?? ""
    dialog.clear()
    props.onConfirm?.(val)
  }

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
      paddingRight={2}
      gap={1}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme().text}>
          <b>{props.title}</b>
        </text>
        <text fg={theme().textMuted} onMouseUp={() => { dialog.clear(); props.onCancel?.() }}>
          esc
        </text>
      </box>
      {props.description?.()}
      <textarea
        onSubmit={confirm}
        height={1}
        ref={(val: TextareaRenderable) => (textarea = val)}
        initialValue={props.value}
        placeholder={props.placeholder ?? "Enter text"}
        textColor={theme().text}
        focusedTextColor={theme().text}
        backgroundColor={theme().backgroundElement}
        focusedBackgroundColor={theme().backgroundElement}
      />
      <text fg={theme().textMuted}>
        Enter <span style={{ fg: theme().text }}>submit</span>
      </text>
    </box>
  )
}
