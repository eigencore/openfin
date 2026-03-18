import { Hono } from "hono"
import { stream } from "hono/streaming"
import { validator } from "hono/validator"
import { HTTPException } from "hono/http-exception"
import z from "zod"
import { lazy } from "../../util/lazy"

const ParamSchema = z.object({ id: z.string() })
const MessageSchema = z.object({ content: z.string() })

export const SessionRoutes = lazy(() =>
  new Hono()
    // GET /session — list sessions
    .get("/", async (c) => {
      // TODO T3-A: return Session.list()
      return c.json([])
    })

    // POST /session — create session
    .post(
      "/",
      validator("json", (value, c) => {
        const result = z.object({ model: z.string().optional() }).safeParse(value)
        if (!result.success) throw new HTTPException(400, { message: result.error.message })
        return result.data
      }),
      async (c) => {
        // TODO T3-A: return Session.create(body)
        throw new HTTPException(501, { message: "Not implemented — waiting for T3-A" })
      },
    )

    // GET /session/:id — get session by id
    .get(
      "/:id",
      validator("param", (value, c) => {
        const result = ParamSchema.safeParse(value)
        if (!result.success) throw new HTTPException(400, { message: result.error.message })
        return result.data
      }),
      async (c) => {
        // TODO T3-A: return Session.get(id)
        throw new HTTPException(501, { message: "Not implemented — waiting for T3-A" })
      },
    )

    // POST /session/:id/message — stream LLM response
    .post(
      "/:id/message",
      validator("param", (value, c) => {
        const result = ParamSchema.safeParse(value)
        if (!result.success) throw new HTTPException(400, { message: result.error.message })
        return result.data
      }),
      validator("json", (value, c) => {
        const result = MessageSchema.safeParse(value)
        if (!result.success) throw new HTTPException(400, { message: result.error.message })
        return result.data
      }),
      async (c) => {
        c.status(200)
        c.header("Content-Type", "application/json")
        return stream(c, async (s) => {
          // TODO T3-A: replace with real Session.chat(id, content)
          const sessionID = c.req.valid("param").id
          const { content } = c.req.valid("json")
          s.write(
            JSON.stringify({
              error: "Not implemented — waiting for T3-A",
              sessionID,
              content,
            }) + "\n",
          )
        })
      },
    )

    // DELETE /session/:id — delete session
    .delete(
      "/:id",
      validator("param", (value, c) => {
        const result = ParamSchema.safeParse(value)
        if (!result.success) throw new HTTPException(400, { message: result.error.message })
        return result.data
      }),
      async (c) => {
        // TODO T3-A: Session.delete(id)
        throw new HTTPException(501, { message: "Not implemented — waiting for T3-A" })
      },
    ),
)
