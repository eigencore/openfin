import { RGBA } from "@opentui/core"
import { createSignal, type JSX, Show } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createSimpleContext } from "../context/helper"

export interface DialogOptions {
  component: () => JSX.Element
}

const DialogContext = createSimpleContext({
  name: "Dialog",
  init: () => {
    const [stack, setStack] = createSignal<DialogOptions[]>([])

    function replace(opts: DialogOptions) {
      setStack([opts])
    }

    function push(opts: DialogOptions) {
      setStack((prev) => [...prev, opts])
    }

    function pop() {
      setStack((prev) => prev.slice(0, -1))
    }

    function clear() {
      setStack([])
    }

    function current() {
      const s = stack()
      return s[s.length - 1]
    }

    function isOpen() {
      return stack().length > 0
    }

    return { replace, push, pop, clear, current, isOpen }
  },
})

export const DialogProvider = DialogContext.provider
export const useDialog = DialogContext.use

export function DialogOverlay() {
  const dialog = useDialog()
  const dims = useTerminalDimensions()

  useKeyboard((key) => {
    if (!dialog.isOpen()) return false
    if (key.name === "escape") {
      dialog.pop()
    }
    return true // consume all keys when dialog is open
  })

  return (
    <Show when={dialog.current()}>
      {(item) => (
        <>
          <box
            position="absolute"
            top={0}
            left={0}
            width={dims().width}
            height={dims().height}
            backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
          />
          {item().component()}
        </>
      )}
    </Show>
  )
}
