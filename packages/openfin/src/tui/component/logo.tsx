import { For } from "solid-js"
import { useTheme } from "../context/theme"

// "OpenFin" rendered as block characters
// Format: array of [leftShadow, rightText] pairs per row
// Shadow markers: _ = below, ^ = above, ~ = both
const LOGO_ROWS = [
  " ██████╗ ██████╗ ███████╗███╗  ██╗███████╗██╗███╗  ██╗",
  "██╔═══██╗██╔══██╗██╔════╝████╗ ██║██╔════╝██║████╗ ██║",
  "██║   ██║██████╔╝█████╗  ██╔██╗██║█████╗  ██║██╔██╗██║",
  "██║   ██║██╔═══╝ ██╔══╝  ██║╚████║██╔══╝  ██║██║╚████║",
  "╚██████╔╝██║     ███████╗██║ ╚███║██║     ██║██║ ╚███║",
  " ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚══╝╚═╝     ╚═╝╚═╝  ╚══╝",
]

interface LogoProps {
  x?: number
  y?: number
}

export function Logo(props: LogoProps) {
  const { theme } = useTheme()
  const x = props.x ?? 0
  const y = props.y ?? 0

  return (
    <For each={LOGO_ROWS}>
      {(row, i) => (
        <text
          position="absolute"
          top={y + i()}
          left={x}
          fg={i() === 0 || i() === LOGO_ROWS.length - 1 ? theme().textMuted : theme().accent}
        >
          {row}
        </text>
      )}
    </For>
  )
}

export const LOGO_WIDTH = 56
export const LOGO_HEIGHT = LOGO_ROWS.length
