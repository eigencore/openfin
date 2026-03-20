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
  "Genera un resumen financiero breve para empezar el día: " +
  "1) alertas activas si las hay, " +
  "2) estado de presupuestos del mes (categorías cerca o sobre el límite), " +
  "3) próximas transacciones recurrentes en los siguientes 3 días. " +
  "Sé conciso — máximo 5 líneas por sección."

const WEEKLY_PROMPT =
  "Genera el reporte semanal completo: " +
  "1) resumen de gastos de los últimos 7 días vs presupuesto, " +
  "2) progreso en metas de ahorro, " +
  "3) estado de deudas (saldo total, próximos pagos), " +
  "4) una recomendación concreta para esta semana. " +
  "Usa tablas o listas donde ayude a la claridad."

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
