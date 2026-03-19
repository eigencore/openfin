import { createSignal, For, onCleanup } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { createSimpleContext } from "../context/helper"
import { useTheme } from "../context/theme"

export type ToastVariant = "info" | "warning" | "error" | "success"

export interface ToastItem {
  id: string
  message: string
  variant: ToastVariant
}

const ToastContext = createSimpleContext({
  name: "Toast",
  init: () => {
    const [toasts, setToasts] = createSignal<ToastItem[]>([])

    function show(message: string, variant: ToastVariant = "info", duration = 3000) {
      const id = crypto.randomUUID()
      setToasts((prev) => [...prev, { id, message, variant }])
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, duration)
      onCleanup(() => clearTimeout(timer))
    }

    return { toasts, show }
  },
})

export const ToastProvider = ToastContext.provider
export const useToast = ToastContext.use

export function ToastList() {
  const { toasts } = useToast()
  const { theme } = useTheme()
  const dims = useTerminalDimensions()

  function variantColor(variant: ToastVariant): RGBA {
    const t = theme()
    switch (variant) {
      case "error":
        return t.error
      case "warning":
        return t.warning
      case "success":
        return t.success
      default:
        return t.accent
    }
  }

  return (
    <For each={toasts()}>
      {(toast, i) => (
        <box
          position="absolute"
          right={2}
          top={dims().height - 4 - i() * 4}
          width={42}
          height={3}
          backgroundColor={theme().backgroundPanel}
          border={true}
          borderColor={variantColor(toast.variant)}
          borderStyle="rounded"
        >
          <text position="absolute" top={1} left={1} fg={variantColor(toast.variant)}>
            {toast.message.slice(0, 38)}
          </text>
        </box>
      )}
    </For>
  )
}
