import { createSignal, onCleanup, Show } from "solid-js"
import type { RGBA } from "@opentui/core"
import type { JSX } from "@opentui/solid"
import { useTheme } from "../context/theme"

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Spinner(props: { children?: JSX.Element; color?: RGBA }) {
  const { theme } = useTheme()
  const color = () => props.color ?? theme().textMuted

  const [frame, setFrame] = createSignal(0)
  const timer = setInterval(() => {
    setFrame((f) => (f + 1) % FRAMES.length)
  }, 80)
  onCleanup(() => clearInterval(timer))

  return (
    <box flexDirection="row" gap={1}>
      <text fg={color()}>{FRAMES[frame()]}</text>
      <Show when={props.children}>
        <text fg={color()}>{props.children}</text>
      </Show>
    </box>
  )
}
