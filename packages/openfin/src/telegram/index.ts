/**
 * openfin telegram — Telegram bot client
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=<token> bun run telegram
 *
 * Optional env vars:
 *   TELEGRAM_ALLOWED_CHATS=123456789,987654321   Comma-separated chat IDs whitelist
 *                                                 (leave empty to allow everyone)
 */

import { createBot, startSSEListener } from "./bot"
import { startReportScheduler } from "./scheduler"

const token = process.env["TELEGRAM_BOT_TOKEN"]
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN environment variable.")
  process.exit(1)
}

const bot = createBot(token)

// Register commands in Telegram (shown as autocomplete when user types /)
await bot.api.setMyCommands([
  { command: "new", description: "Nueva conversación" },
  { command: "accounts", description: "Ver cuentas" },
  { command: "budgets", description: "Ver presupuestos" },
  { command: "goals", description: "Ver metas financieras" },
  { command: "model", description: "Cambiar modelo de IA" },
  { command: "history", description: "Sesiones anteriores" },
  { command: "abort", description: "Cancelar respuesta en curso" },
  { command: "help", description: "Ayuda" },
])

// Connect to the OpenFin server SSE stream
startSSEListener(bot)

// Scheduled reports — daily at 8 AM, weekly on Mondays
startReportScheduler(bot)

console.log("OpenFin Telegram bot started (long-polling)…")
await bot.start()
