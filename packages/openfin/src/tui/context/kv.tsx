import { createSignal } from "solid-js"
import { createSimpleContext } from "./helper"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

const KV_PATH = path.join(os.homedir(), ".openfin", "tui-state.json")

function loadStore(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(KV_PATH, "utf-8")
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveStore(data: Record<string, unknown>) {
  const dir = path.dirname(KV_PATH)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(KV_PATH, JSON.stringify(data, null, 2))
}

const KVContext = createSimpleContext({
  name: "KV",
  init: () => {
    const store: Record<string, unknown> = loadStore()

    function get<T>(key: string, defaultValue: T): T {
      const val = store[key]
      if (val === undefined) return defaultValue
      return val as T
    }

    function set<T>(key: string, value: T): void {
      store[key] = value
      saveStore(store)
    }

    function signal<T>(name: string, defaultValue: T) {
      const [read, write] = createSignal<T>(get(name, defaultValue))
      return [
        read,
        (value: T) => {
          set(name, value)
          write(() => value)
        },
      ] as const
    }

    return { get, set, signal }
  },
})

export const KVProvider = KVContext.provider
export const useKV = KVContext.use
