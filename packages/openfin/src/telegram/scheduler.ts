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
  "Good morning! Run a quick daily check. Use check_alerts first. Then check budget status for this month " +
  "(flag any category over 80% of its limit). Finally, list any recurring transactions due in the next 3 days. " +
  "Be concise — no more than 5 lines per section. Lead with anything that needs immediate attention."

const WEEKLY_PROMPT =
  "Weekly financial review. Use the financial_analysis skill to run a full analysis. " +
  "Focus on: spending trends vs last week, goal progress, and the single most impactful action the user could take this week. " +
  "End with one concrete next step."

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
