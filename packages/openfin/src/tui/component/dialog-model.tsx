import { createMemo } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useKV } from "../context/kv"
import { DialogSelect } from "../ui/dialog-select"
import { Provider } from "@/provider/provider"

export const MODEL_KV_KEY = "selected_model"

export function useModel() {
  const kv = useKV()
  return kv.signal<string>(MODEL_KV_KEY, Provider.defaultModel())
}

export function DialogModel() {
  const dialog = useDialog()
  const { theme } = useTheme()
  const kv = useKV()
  const [, setModel] = kv.signal<string>(MODEL_KV_KEY, Provider.defaultModel())

  const models = Provider.list()

  const anthropicModels = createMemo(() => models.filter((m) => m.provider === "anthropic"))
  const openaiModels = createMemo(() => models.filter((m) => m.provider === "openai"))

  const items = createMemo(() => [
    ...anthropicModels().map((m) => ({
      label: m.name,
      description: "Anthropic",
      onSelect: () => {
        setModel(m.id)
        dialog.clear()
      },
    })),
    ...openaiModels().map((m) => ({
      label: m.name,
      description: "OpenAI",
      onSelect: () => {
        setModel(m.id)
        dialog.clear()
      },
    })),
  ])

  return <DialogSelect title="Select Model" items={items()} />
}
