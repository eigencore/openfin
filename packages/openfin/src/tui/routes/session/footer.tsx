import { createMemo } from "solid-js"
import { useTheme } from "../../context/theme"
import { useModel } from "../../component/dialog-model"
import { useModels } from "../../context/models"

export function Footer() {
  const { theme } = useTheme()
  const [selectedModel] = useModel()
  const { models } = useModels()

  const modelLabel = createMemo(() => {
    const id = selectedModel()
    const found = models().find((m) => m.id === id)
    if (found) return found.name
    // fallback: strip provider prefix
    const colon = id.indexOf(":")
    return colon >= 0 ? id.slice(colon + 1) : id
  })

  return (
    <box flexDirection="row" justifyContent="space-between" gap={1} flexShrink={0}>
      <text fg={theme().textMuted}>{"? for shortcuts"}</text>
      <text fg={theme().textMuted}>{modelLabel()}</text>
    </box>
  )
}
