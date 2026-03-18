import { Hono } from "hono"
import { cors } from "hono/cors"
import { streamSSE } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { Bus } from "../bus"
import { NamedError } from "../util/error"
import { lazy } from "../util/lazy"
import { SessionRoutes } from "./routes/session"
import { ProviderRoutes } from "./routes/provider"
import type { ContentfulStatusCode } from "hono/utils/http-status"

export namespace Server {
  export const PORT = 4096

  export const Default = lazy(() => createApp())

  export function createApp(): Hono {
    const app = new Hono()

    return app
      // ── Error handler ────────────────────────────────────────────────────
      .onError((err, c) => {
        if (err instanceof NamedError) {
          let status: ContentfulStatusCode = 500
          if (err.name === "NotFoundError") status = 404
          return c.json(err.toObject(), { status })
        }
        if (err instanceof HTTPException) {
          return c.json({ error: err.message }, { status: err.status as ContentfulStatusCode })
        }
        console.error("[server] unhandled error", err)
        const message = err instanceof Error && err.stack ? err.stack : String(err)
        return c.json(new NamedError.Unknown({ message }).toObject(), { status: 500 })
      })

      // ── Request logging ───────────────────────────────────────────────────
      .use(async (c, next) => {
        const start = Date.now()
        console.log(`[server] → ${c.req.method} ${c.req.path}`)
        await next()
        console.log(`[server] ← ${c.req.method} ${c.req.path} ${c.res.status} (${Date.now() - start}ms)`)
      })

      // ── CORS ──────────────────────────────────────────────────────────────
      .use(
        cors({
          origin(input) {
            if (!input) return
            if (input.startsWith("http://localhost:")) return input
            if (input.startsWith("http://127.0.0.1:")) return input
            return
          },
        }),
      )

      // ── Routes ────────────────────────────────────────────────────────────
      .route("/session", SessionRoutes())
      .route("/provider", ProviderRoutes())

      // ── SSE /event — Bus events in real time ──────────────────────────────
      .get("/event", async (c) => {
        console.log("[server] event connected")
        c.header("X-Accel-Buffering", "no")
        c.header("X-Content-Type-Options", "nosniff")

        return streamSSE(c, async (stream) => {
          // Send initial connected event
          await stream.writeSSE({
            data: JSON.stringify({ type: "server.connected", properties: {} }),
          })

          const unsub = Bus.subscribeAll(async (event) => {
            await stream.writeSSE({ data: JSON.stringify(event) })
          })

          // Heartbeat every 10s to prevent stalled proxy streams (same as opencode)
          const heartbeat = setInterval(() => {
            stream.writeSSE({
              data: JSON.stringify({ type: "server.heartbeat", properties: {} }),
            })
          }, 10_000)

          await new Promise<void>((resolve) => {
            stream.onAbort(() => {
              clearInterval(heartbeat)
              unsub()
              resolve()
              console.log("[server] event disconnected")
            })
          })
        })
      })
  }

  export function listen(port = PORT) {
    const app = Default()
    const server = Bun.serve({
      fetch: app.fetch,
      port,
    })
    console.log(`[server] listening on http://localhost:${server.port}`)
    return server
  }
}
