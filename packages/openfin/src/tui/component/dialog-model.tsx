import { createMemo, Show } from "solid-js"
import { useDialog } from "../ui/dialog"
import { useKV } from "../context/kv"
import { useModels } from "../context/models"
import { DialogSelect } from "../ui/dialog-select"
import { Provider } from "@/provider/provider"
import { useTheme } from "../context/theme"

export const MODEL_KV_KEY = "selected_model"

export function useModel() {
  const kv = useKV()
  return kv.signal<string>(MODEL_KV_KEY, Provider.defaultModel())
}

export function DialogModel() {
  const dialog = useDialog()
  const kv = useKV()
  const { theme } = useTheme()
  const [, setModel] = kv.signal<string>(MODEL_KV_KEY, Provider.defaultModel())
  const { models } = useModels()

  const items = createMemo(() =>
    models().map((m) => ({
      label: m.name,
      description: m.providerName,
      onSelect: () => {
        setModel(m.id)
        dialog.clear()
      },
    })),
  )

  return (
    <Show
      when={items().length > 0}
      fallback={
        <DialogSelect title="Select Model" items={[{ label: "Loading models…", onSelect: () => {} }]} />
      }
    >
      <DialogSelect title="Select Model" items={items()} />
    </Show>
  )
}
