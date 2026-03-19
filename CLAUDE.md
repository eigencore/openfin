# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the **root** (Turborepo orchestrates all packages):

```bash
bun run dev          # Start all dev servers
bun run build        # Build all packages
bun run typecheck    # Type-check all packages
```

Run from **`packages/openfin/`** directly:

```bash
bun run dev          # Start HTTP server (port 4096)
bun run chat         # Start CLI REPL client
bun run tui          # Start terminal UI (Solid.js)
bun run typecheck    # tsc --noEmit
```

No test runner is configured yet. Type checking is the primary static verification.

### Database migrations

```bash
# Generate a new migration
bunx drizzle-kit generate

# Migrations auto-apply on server startup — no manual push needed
```

## Architecture

OpenFin is an AI-powered financial assistant with a **server + multi-client** architecture.

### Three-tier layout

```
src/server/    → Hono HTTP server (port 4096) — REST API + SSE streaming
src/session/   → LLM chat logic — streams responses, runs tool loop (max 10 steps)
src/provider/  → LLM abstraction — Anthropic (default) and OpenAI
src/tool/      → Tool registry — wraps tools with Bus events for observability
src/profile/   → Financial data — accounts, debts, budgets, goals, transactions
src/storage/   → SQLite via Drizzle ORM — migrations auto-applied on startup
src/bus/       → Pub/sub event system — typed with Zod, drives SSE stream
src/cli/       → Readline REPL client — connects to HTTP server
src/tui/       → Solid.js terminal UI — connects to HTTP server
```

### Data flow

```
User Input → CLI / TUI
  → POST /session/:id/message
  → session.chat() → LLM Provider
  → Tool execution (auto Bus events)
  → Bus events → SSE /event stream
  → Client renders streamed chunks
```

### Key conventions

- **Entry points**: `src/index.ts` (server), `src/cli/index.ts` (REPL), `src/tui/index.ts` (TUI).
- **Tool shape**: each tool exports a `Tool` implementing `{ id, description, parameters: ZodSchema, execute() → { title, output, metadata? } }`. Register in `src/index.ts` (and `src/tui/index.ts` for TUI).
- **Schema files**: named `*.sql.ts`, discovered by Drizzle via `src/**/*.sql.ts`. Keep schema co-located with its domain (e.g., `src/profile/profile.sql.ts`).
- **Path aliases**: `@/*` → `src/*`, `@tui/*` → `src/tui/*`.
- **Formatting**: Prettier with `semi: false`, `printWidth: 120`.
- **Database path**: `~/.openfin/openfin.db` (WAL mode). Do not change without updating `src/storage/db.ts` and `drizzle.config.ts`.
- **LLM context**: `buildFinancialContext()` in `src/session/index.ts` injects current financial state into each chat request.
- **Default model**: `anthropic:claude-sonnet-4-5`. Falls back to `openai:gpt-4o` if `ANTHROPIC_API_KEY` is absent.
- **System prompt**: `src/provider/system.ts` — edit here to change assistant behavior.
