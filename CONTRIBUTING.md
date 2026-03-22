# Contributing to OpenFin

Thanks for your interest. This document covers how to set up the project locally, the conventions to follow, and how to submit a contribution.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- An API key for at least one supported provider (Anthropic, OpenAI, Google, Groq, Mistral, xAI, or OpenRouter)

## Local setup

```bash
git clone https://github.com/eigencore/openfin
cd openfin
bun install
bun run dev        # Terminal 1 — HTTP server on port 4096
bun run tui        # Terminal 2 — full-screen UI (optional)
```

Configure your API key:

```bash
openfin auth login
```

## Project structure

```
src/
├── index.ts      # entry point — subcommand dispatch
├── server/       # Hono HTTP server — REST + SSE
├── session/      # LLM chat loop and tool execution
├── provider/     # LLM provider abstraction
├── tool/         # tool definitions and registry
├── profile/      # financial data layer
├── storage/      # SQLite via Drizzle ORM
├── bus/          # pub/sub event system
├── tui/          # Solid.js terminal UI
├── cli/          # readline REPL
└── telegram/     # Telegram bot
```

## Adding a tool

1. Create your tool file under `src/tool/` implementing the `Tool` interface:

```ts
export const myTool: Tool = {
  id: "my_tool",
  description: "What this tool does",
  parameters: z.object({ ... }),
  async execute(params) {
    return { title: "Result title", output: "..." }
  },
}
```

2. Register it in `src/index.ts` (and `src/tui/index.ts` if it should be available in the TUI).

## Database changes

OpenFin uses Drizzle ORM with versioned SQL migrations. Schema files are named `*.sql.ts` and co-located with their domain (e.g. `src/profile/profile.sql.ts`).

After editing a schema file:

```bash
bunx drizzle-kit generate   # generates a new migration file
```

Migrations apply automatically on server start — no manual push needed.

> Do not edit existing migration files. Always generate a new one.

## Code style

- Strict TypeScript — no `any`.
- Prettier config: `semi: false`, `printWidth: 120`. Run `bunx prettier --write .` before committing.
- Type-check before opening a PR: `bun run typecheck`.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(tool): add upsert_investment tool
fix(session): handle empty tool result gracefully
docs: update installation instructions
```

## Opening a pull request

1. Fork the repo and create a branch from `main`.
2. Make your changes — keep PRs focused on a single concern.
3. Run `bun run typecheck` and make sure it passes.
4. Open a PR with a clear description of what it does and why.

For large changes or new features, open an issue first to discuss the approach.

## Reporting bugs

Open an issue and include:
- OpenFin version (`openfin --version`)
- OS and architecture
- Steps to reproduce
- Expected vs. actual behavior
