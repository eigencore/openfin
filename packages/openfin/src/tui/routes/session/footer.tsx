import { useTheme } from "../../context/theme"

export function Footer() {
  const { theme } = useTheme()

  const directory = process.cwd()

  return (
    <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0}>
      <text fg={theme().textMuted}>{directory}</text>
      <box gap={2} flexDirection="row" flexShrink={0}>
        <text fg={theme().textMuted}>/help</text>
      </box>
    </box>
  )
}
