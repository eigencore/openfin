import { Hono } from "hono"
import { lazy } from "../../util/lazy"
import { Provider } from "../../provider/provider"

export const ProviderRoutes = lazy(() =>
  new Hono().get("/", (c) => {
    return c.json(Provider.list())
  }),
)
