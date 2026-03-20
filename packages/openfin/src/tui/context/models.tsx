import { createEffect, createSignal, onMount } from "solid-js"
import { createSimpleContext } from "./helper"
import { useSDK, type ModelInfo } from "./sdk"
import { useKV } from "./kv"
import { Provider } from "@/provider/provider"

const MODEL_KV_KEY = "selected_model"

const ModelsContext = createSimpleContext({
  name: "Models",
  init: () => {
    const sdk = useSDK()
    const kv = useKV()
    const [models, setModels] = createSignal<ModelInfo[]>([])

    onMount(async () => {
      try {
        const data = await sdk.api.listModels()
        setModels(data)
      } catch (err) {
        console.error("Failed to load models:", err)
      }
    })

    // When model list loads/changes, validate the stored selection.
    // If the saved model is no longer in the active list, reset to default.
    const [selectedModel, setSelectedModel] = kv.signal<string>(MODEL_KV_KEY, Provider.defaultModel())
    createEffect(() => {
      const list = models()
      if (list.length === 0) return
      const valid = list.some((m) => m.id === selectedModel())
      if (!valid) {
        const fallback = Provider.defaultModel()
        setSelectedModel(list.some((m) => m.id === fallback) ? fallback : list[0]!.id)
      }
    })

    return { models }
  },
})

export const ModelsProvider = ModelsContext.provider
export const useModels = ModelsContext.use
export type { ModelInfo }
