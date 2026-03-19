import { createStore } from "solid-js/store"
import { createSimpleContext } from "./helper"

export type HomeRoute = { type: "home" }
export type SessionRoute = { type: "session"; sessionID: string; initialPrompt?: string }
export type Route = HomeRoute | SessionRoute

export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: () => {
    const [store, setStore] = createStore<Route>({ type: "home" })

    return {
      get data() {
        return store
      },
      navigate(route: Route) {
        setStore(route as any)
      },
    }
  },
})

export type RouteContext = ReturnType<typeof useRoute>

export function useRouteData<T extends Route["type"]>(type: T) {
  const route = useRoute()
  return route.data as Extract<Route, { type: T }>
}
