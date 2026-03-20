import { useTheme } from "../context/theme"

interface LogoProps {
  x?: number
  y?: number
}

export function Logo(props: LogoProps) {
  const { theme } = useTheme()

  return (
    <>
      <text position="absolute" top={props.y ?? 0} left={props.x ?? 0} fg={theme().accent}>
        {"◆  O P E N F I N"}
      </text>
      <text position="absolute" top={(props.y ?? 0) + 1} left={props.x ?? 0} fg={theme().textMuted}>
        {"────────────────"}
      </text>
    </>
  )
}

export const LOGO_WIDTH = 16
export const LOGO_HEIGHT = 2
