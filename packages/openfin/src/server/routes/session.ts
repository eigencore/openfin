import { Hono } from "hono"
import { validator } from "hono/validator"
import { HTTPException } from "hono/http-exception"
import z from "zod"
import { lazy } from "../../util/lazy"
import { Session } from "../../session/index"

const ParamSchema = z.object({ id: z.string() })

const CreateSchema = z.object({ title: z.string().optional() })
const RenameSchema = z.object({ title: z.string().min(1) })

const MessageSchema = z.object({
  content: z.string(),
  model: z.string().optional(),
})

export const SessionRoutes = lazy(() =>
  new Hono()
    // GET /session — list sessions
    .get("/", (c) => {
      return c.json(Session.list())
    })

    // POST /session — create session
    .post(
      "/",
      validator("json", (value, c) => {
        const result = CreateSchema.safeParse(value)
        if (!result.success) throw new HTTPException(400, { message: result.error.message })
        return result.data
      }),
      (c) => {
        const body = c.req.valid("json")
        const session = Session.create({ title: body.title })
        return c.json(session, 201)
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
      (c) => {
        const { id } = c.req.valid("param")
        return c.json(Session.get(id))
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
      (c) => {
        const { id } = c.req.valid("param")
        const { content, model } = c.req.valid("json")
        // Fire-and-forget — all updates come via SSE Bus events
        ;(async () => {
          try {
            for await (const _ of Session.chat(id, content, model)) {}
          } catch {}
        })()
        return c.body(null, 202)
      },
    )

    // POST /session/:id/abort — abort streaming for a session
    .post(
      "/:id/abort",
      validator("param", (value, c) => {
        const result = ParamSchema.safeParse(value)
        if (!result.success) throw new HTTPException(400, { message: result.error.message })
        return result.data
      }),
      (c) => {
        const { id } = c.req.valid("param")
        Session.abort(id)
        return c.body(null, 204)
      },
    )

    // GET /session/:id/parts — return all parts grouped by messageID
    .get(
      "/:id/parts",
      validator("param", (value, c) => {
        const result = ParamSchema.safeParse(value)
        if (!result.success) throw new HTTPException(400, { message: result.error.message })
        return result.data
      }),
      (c) => {
        const { id } = c.req.valid("param")
        return c.json(Session.parts(id))
      },
    )

    // GET /session/:id/messages — list messages for a session
    .get(
      "/:id/messages",
      validator("param", (value, c) => {
        const result = ParamSchema.safeParse(value)
        if (!result.success) throw new HTTPException(400, { message: result.error.message })
        return result.data
      }),
      (c) => {
        const { id } = c.req.valid("param")
        return c.json(Session.messages(id))
      },
    )

    // PATCH /session/:id — rename session
    .patch(
      "/:id",
      validator("param", (value, c) => {
        const result = ParamSchema.safeParse(value)
        if (!result.success) throw new HTTPException(400, { message: result.error.message })
        return result.data
      }),
      validator("json", (value, c) => {
        const result = RenameSchema.safeParse(value)
        if (!result.success) throw new HTTPException(400, { message: result.error.message })
        return result.data
      }),
      (c) => {
        const { id } = c.req.valid("param")
        const { title } = c.req.valid("json")
        const session = Session.rename(id, title)
        return c.json(session)
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
      (c) => {
        const { id } = c.req.valid("param")
        Session.remove(id)
        return c.body(null, 204)
      },
    ),
)
