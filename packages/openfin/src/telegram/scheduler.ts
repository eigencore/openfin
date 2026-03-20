/**
 * Scheduled financial reports pushed to Telegram.
 *
 * Daily  — every day at DAILY_HOUR  (default 8 AM): brief status + alerts
 * Weekly — every Monday at DAILY_HOUR: full weekly spending + recommendations
 */

import { Bot } from "grammy"
import { api } from "../tui/context/sdk"
import { SessionMap } from "./session-map"
import { sendMessage } from "./bot"

const DAILY_HOUR = 8 // local hour (0–23) when reports fire
const CHECK_INTERVAL_MS = 60 * 1000 // check every minute

const DAILY_PROMPT =
  "Generate a brief financial summary to start the day: " +
  "1) active alerts if any, " +
  "2) budget status for the month (categories near or over the limit), " +
  "3) upcoming recurring transactions in the next 3 days. " +
  "Be concise — maximum 5 lines per section."

const WEEKLY_PROMPT =
  "Generate the full weekly report: " +
  "1) spending summary for the last 7 days vs budget, " +
  "2) progress on savings goals, " +
  "3) debt status (total balance, upcoming payments), " +
  "4) one concrete recommendation for this week. " +
  "Use tables or lists where it helps clarity."

async function sendReport(bot: Bot, chatId: number, prompt: string) {
  try {
    const session = await api.createSession()
    await SessionMap.set(chatId, session.id)
    await sendMessage(bot, chatId, session.id, prompt)
  } catch (err) {
    console.error(`[scheduler] Error sending report to chat ${chatId}:`, err)
  }
}

export function startReportScheduler(bot: Bot) {
  let lastDailyDate = ""
  let lastWeeklyDate = ""

  async function tick() {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
    const hour = now.getHours()
    const isMonday = now.getDay() === 1

    if (hour !== DAILY_HOUR) return

    const chats = await SessionMap.listChats()
    if (chats.length === 0) return

    // Weekly report on Monday (runs before daily to avoid duplicate session creation)
    if (isMonday && lastWeeklyDate !== todayStr) {
      lastWeeklyDate = todayStr
      console.log(`[scheduler] Sending weekly report to ${chats.length} chat(s)`)
      for (const chatId of chats) {
        await sendReport(bot, chatId, WEEKLY_PROMPT)
      }
      return // weekly replaces daily on Mondays
    }

    // Daily report
    if (lastDailyDate !== todayStr) {
      lastDailyDate = todayStr
      console.log(`[scheduler] Sending daily report to ${chats.length} chat(s)`)
      for (const chatId of chats) {
        await sendReport(bot, chatId, DAILY_PROMPT)
      }
    }
  }

  setInterval(tick, CHECK_INTERVAL_MS)
  console.log(`[scheduler] Report scheduler started — daily reports at ${DAILY_HOUR}:00`)
}
