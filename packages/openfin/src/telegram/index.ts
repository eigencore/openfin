/**
 * openfin telegram — Telegram bot client
 *
 * Usage:
 *   openfin telegram           Start the bot (reads token from env or auth.json)
 *   openfin telegram login     Interactive: save your bot token from @BotFather
 *
 * Optional env vars:
 *   TELEGRAM_BOT_TOKEN=<token>                   Takes priority over stored token
 *   TELEGRAM_ALLOWED_CHATS=123456789,987654321   Comma-separated chat IDs whitelist
 *                                                 (leave empty to allow everyone)
 */

import * as prompts from "@clack/prompts"
import { createBot, startSSEListener } from "./bot"
import { startReportScheduler } from "./scheduler"
import { Auth } from "../auth/index"

const subcommand = process.argv[3]

if (subcommand === "login") {
  prompts.intro("Save Telegram bot token")

  const token = await prompts.password({
    message: "Paste your bot token from @BotFather",
    validate: (x) => (x && x.length > 0 ? undefined : "Required"),
  })
  if (prompts.isCancel(token)) {
    prompts.cancel("Cancelled")
    process.exit(0)
  }

  await Auth.set("telegram", token as string)
  prompts.outro("Telegram bot token saved. Run: openfin telegram")
  process.exit(0)
}

const token = process.env["TELEGRAM_BOT_TOKEN"] ?? await Auth.get("telegram")
if (!token) {
  console.error("Telegram bot token not found.")
  console.error("Run: openfin telegram login")
  console.error("Or set the TELEGRAM_BOT_TOKEN environment variable.")
  process.exit(1)
}

const bot = createBot(token)

// Register commands in Telegram (shown as autocomplete when user types /)
await bot.api.setMyCommands([
  { command: "new", description: "New conversation" },
  { command: "accounts", description: "View accounts" },
  { command: "budgets", description: "View budgets" },
  { command: "goals", description: "View financial goals" },
  { command: "model", description: "Change AI model" },
  { command: "history", description: "Previous sessions" },
  { command: "abort", description: "Cancel current response" },
  { command: "help", description: "Help" },
])

// Connect to the OpenFin server SSE stream
startSSEListener(bot)

// Scheduled reports — daily at 8 AM, weekly on Mondays
startReportScheduler(bot)

console.log("OpenFin Telegram bot started (long-polling)…")
await bot.start()
