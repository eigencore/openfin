import { EventEmitter } from "events"

export const GlobalBus = new EventEmitter<{
  event: [
    {
      payload: any
    },
  ]
}>()
