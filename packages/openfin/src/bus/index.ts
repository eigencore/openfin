import z from "zod"
import { BusEvent } from "./bus-event"
import { GlobalBus } from "./global"

export namespace Bus {
  type Subscription = (event: any) => void

  const subscriptions = new Map<string, Subscription[]>()

  // ── Core events ──────────────────────────────────────────────────────────

  export const SessionStatus = BusEvent.define(
    "session.status",
    z.object({
      sessionID: z.string(),
      status: z.enum(["idle", "busy"]),
    }),
  )

  export const MessagePartUpdated = BusEvent.define(
    "message.part.updated",
    z.object({
      sessionID: z.string(),
      messageID: z.string(),
      delta: z.string(),
    }),
  )

  export const SessionError = BusEvent.define(
    "session.error",
    z.object({
      sessionID: z.string().optional(),
      error: z.string(),
    }),
  )

  // ── Pub/Sub ───────────────────────────────────────────────────────────────

  export async function publish<Definition extends BusEvent.Definition>(
    def: Definition,
    properties: z.output<Definition["properties"]>,
  ) {
    const payload = { type: def.type, properties }
    const pending: Promise<any>[] = []

    for (const key of [def.type, "*"]) {
      for (const sub of subscriptions.get(key) ?? []) {
        pending.push(Promise.resolve(sub(payload)))
      }
    }

    GlobalBus.emit("event", { payload })

    return Promise.all(pending)
  }

  export function subscribe<Definition extends BusEvent.Definition>(
    def: Definition,
    callback: (event: { type: Definition["type"]; properties: z.infer<Definition["properties"]> }) => void,
  ) {
    return raw(def.type, callback)
  }

  export function once<Definition extends BusEvent.Definition>(
    def: Definition,
    callback: (event: {
      type: Definition["type"]
      properties: z.infer<Definition["properties"]>
    }) => "done" | undefined,
  ) {
    const unsub = subscribe(def, (event) => {
      if (callback(event)) unsub()
    })
  }

  export function subscribeAll(callback: (event: any) => void) {
    return raw("*", callback)
  }

  function raw(type: string, callback: Subscription) {
    const match = subscriptions.get(type) ?? []
    match.push(callback)
    subscriptions.set(type, match)

    return () => {
      const current = subscriptions.get(type)
      if (!current) return
      const index = current.indexOf(callback)
      if (index === -1) return
      current.splice(index, 1)
    }
  }
}
