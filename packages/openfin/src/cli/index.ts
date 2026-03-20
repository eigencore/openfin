/**
 * T3-B: Bootstrap + CLI
 *
 * Terminal client for openfin. Connects to the HTTP server, creates a session,
 * and streams AI responses to the terminal.
 *
 * Usage:
 *   bun run src/cli/index.ts [--model openai:gpt-4o] [--session <id>]
 */

import { createInterface } from "readline"

const SERVER = process.env.OPENFIN_SERVER ?? "http://localhost:4096"

// ── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(): { model: string | undefined; sessionId: string | undefined } {
  const args = process.argv.slice(2)
  let model: string | undefined
  let sessionId: string | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) model = args[++i]
    else if (args[i] === "--session" && args[i + 1]) sessionId = args[++i]
  }

  return { model, sessionId }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function createSession(title?: string): Promise<string> {
  const res = await fetch(`${SERVER}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to create session: ${res.status} ${err}`)
  }
  const data = (await res.json()) as { id: string }
  return data.id
}

async function verifySession(id: string): Promise<boolean> {
  const res = await fetch(`${SERVER}/session/${id}`)
  return res.ok
}

/**
 * Stream a message to the session. Yields text chunks as they arrive.
 */
async function* streamMessage(
  sessionId: string,
  content: string,
  model?: string,
): AsyncGenerator<string> {
  const body: Record<string, string> = { content }
  if (model) body.model = model

  const res = await fetch(`${SERVER}/session/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Server error: ${res.status} ${err}`)
  }

  if (!res.body) throw new Error("No response body")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // NDJSON: split on newlines and process complete lines
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? "" // keep the last incomplete line

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const parsed = JSON.parse(trimmed) as { delta?: string; done?: boolean; error?: string }
      if (parsed.error) throw new Error(parsed.error)
      if (parsed.delta) yield parsed.delta
      if (parsed.done) return
    }
  }

  // Process any remaining buffer content
  if (buffer.trim()) {
    const parsed = JSON.parse(buffer.trim()) as { delta?: string; done?: boolean }
    if (parsed.delta) yield parsed.delta
  }
}

// ── Command helpers ───────────────────────────────────────────────────────────

function parseCommand(input: string): { command: string; args: string[] } | null {
  if (!input.startsWith("/")) return null
  const parts = input.slice(1).trim().split(/\s+/)
  const command = parts[0]!.toLowerCase()
  const args = parts.slice(1)
  return { command, args }
}

async function runCommand(command: string, args: string[]): Promise<void> {
  if (command === "exit" || command === "quit") return // handled in loop

  try {
    const res = await fetch(`${SERVER}/cmd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, args }),
    })

    const data = (await res.json()) as { output?: string; error?: string }

    if (!res.ok || data.error) {
      process.stdout.write(`\x1b[31m[error] ${data.error ?? "Unknown error"}\x1b[0m\n`)
      return
    }

    process.stdout.write(`\n${data.output}\n`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stdout.write(`\x1b[31m[error] ${message}\x1b[0m\n`)
  }
}

// ── REPL ─────────────────────────────────────────────────────────────────────

async function repl(sessionId: string, model?: string) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  const prompt = () =>
    new Promise<string | null>((resolve) => {
      rl.question("\n\x1b[36m❯\x1b[0m ", (input) => {
        resolve(input)
      })
      rl.once("close", () => resolve(null))
    })

  console.log("\x1b[90m  Chat with the assistant or type /help for available commands.\x1b[0m")

  while (true) {
    const input = await prompt()

    if (input === null) break // EOF / Ctrl+D
    const trimmed = input.trim()
    if (!trimmed) continue
    if (trimmed === "/exit" || trimmed === "/quit") break

    const cmd = parseCommand(trimmed)

    if (cmd) {
      await runCommand(cmd.command, cmd.args)
      continue
    }

    process.stdout.write("\n\x1b[32mAssistant:\x1b[0m ")

    try {
      for await (const chunk of streamMessage(sessionId, trimmed, model)) {
        process.stdout.write(chunk)
      }
      process.stdout.write("\n")
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stdout.write(`\n\x1b[31m[error] ${message}\x1b[0m\n`)
    }
  }

  rl.close()
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { model, sessionId: existingSessionId } = parseArgs()

  // Check server is reachable
  try {
    const res = await fetch(`${SERVER}/provider`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`\x1b[31m[openfin] Cannot reach server at ${SERVER}: ${message}\x1b[0m`)
    console.error(`\x1b[90m  Start the server first: openfin\x1b[0m`)
    process.exit(1)
  }

  let sessionId: string

  if (existingSessionId) {
    const exists = await verifySession(existingSessionId)
    if (!exists) {
      console.error(`\x1b[31m[openfin] Session not found: ${existingSessionId}\x1b[0m`)
      process.exit(1)
    }
    sessionId = existingSessionId
    console.log(`\x1b[90m[openfin] Resuming session ${sessionId}\x1b[0m`)
  } else {
    sessionId = await createSession()
    console.log(`\x1b[90m[openfin] New session ${sessionId}\x1b[0m`)
  }

  if (model) {
    console.log(`\x1b[90m[openfin] Model: ${model}\x1b[0m`)
  }

  console.log(
    "\x1b[1m\x1b[33m\n  OpenFin — AI Financial Assistant\x1b[0m\n",
  )

  await repl(sessionId, model)

  console.log("\n\x1b[90m[openfin] Session ended. Goodbye.\x1b[0m")
}

main().catch((err) => {
  console.error("\x1b[31m[openfin] Fatal error:\x1b[0m", err)
  process.exit(1)
})
