import { createResource, For, Show } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { api, type DashboardData } from "../context/sdk"

// ── Formatting helpers ─────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function progressBar(current: number, target: number, width = 10): string {
  const ratio = Math.min(1, target === 0 ? 0 : current / target)
  const filled = Math.round(ratio * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s
}

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]

function sparkline(values: number[], width: number): string {
  if (values.length === 0) return "─".repeat(width)
  const sampled: number[] = []
  for (let i = 0; i < width; i++) {
    const idx = Math.floor((i / width) * values.length)
    sampled.push(values[idx] ?? 0)
  }
  const min = Math.min(...sampled)
  const max = Math.max(...sampled)
  const range = max - min || 1
  return sampled
    .map((v) => SPARK_CHARS[Math.min(7, Math.floor(((v - min) / range) * 8))] ?? "▁")
    .join("")
}

// ── Row types ──────────────────────────────────────────────────────────────────

type Color = "text" | "muted" | "accent" | "success" | "error" | "warning"

interface Row {
  kind: "header" | "row" | "divider" | "empty"
  text: string
  color?: Color
  bold?: boolean
}

function push(rows: Row[], kind: Row["kind"], text = "", color: Color = "text", bold = false) {
  rows.push({ kind, text, color, bold })
}

// ── Left column rows: net worth, accounts, debts ───────────────────────────────

function buildLeftRows(data: DashboardData, colW: number): Row[] {
  const rows: Row[] = []
  const innerW = colW - 3
  const nw = data.netWorth

  // Net Worth
  push(rows, "header", "NET WORTH", "accent")
  push(rows, "row", `Total   ${fmt(nw.net_worth)} ${nw.currency}`, nw.net_worth >= 0 ? "success" : "error")
  push(rows, "row", `Assets  ${fmt(nw.assets)}`)
  push(rows, "row", `Debts   ${fmt(nw.debts)}`)
  if (nw.delta !== undefined) {
    const sign = nw.delta >= 0 ? "+" : ""
    push(rows, "row", `Change  ${sign}${fmt(nw.delta)}`, nw.delta >= 0 ? "success" : "error")
  }
  if (data.income) {
    push(rows, "row", `Income  ${fmt(data.income.amount)}/mo`, "muted")
  }

  // Net worth sparkline
  if ((data.netWorthHistory?.length ?? 0) > 2) {
    const values = data.netWorthHistory.map((h) => h.value)
    const spark = sparkline(values, innerW - 4)
    const trend = values[values.length - 1]! >= values[0]! ? "success" : "error"
    push(rows, "row", `↗  ${spark}`, trend)
  }

  // Accounts — assets
  const assets = data.accounts.filter((a) => a.type !== "credit_card")
  const cards = data.accounts.filter((a) => a.type === "credit_card")
  if (assets.length > 0) {
    push(rows, "divider")
    push(rows, "header", "ACCOUNTS", "accent")
    for (const a of assets) {
      const bal = fmt(a.balance)
      const maxLabel = innerW - bal.length - 1
      const label = truncate(a.name, maxLabel).padEnd(maxLabel)
      const sub = a.institution ? ` · ${truncate(a.institution, 10)}` : ""
      push(rows, "row", `${label} ${bal}${sub}`, "success")
    }
    const totalAssets = assets.reduce((s, a) => s + a.balance, 0)
    if (assets.length > 1) {
      const bal = fmt(totalAssets)
      const maxLabel = innerW - bal.length - 1
      push(rows, "row", `${"Total".padEnd(maxLabel)} ${bal}`, "muted")
    }
  }

  // Credit cards
  if (cards.length > 0) {
    push(rows, "divider")
    push(rows, "header", "CREDIT CARDS", "accent")
    for (const a of cards) {
      const owed = Math.abs(a.balance)
      const bal = owed > 0 ? `-${fmt(owed)}` : fmt(0)
      const maxLabel = innerW - bal.length - 1
      const label = truncate(a.name, maxLabel).padEnd(maxLabel)
      push(rows, "row", `${label} ${bal}`, owed > 0 ? "error" : "success")
      if (a.credit_limit) {
        const avail = a.credit_limit - owed
        push(rows, "row", `  avail ${fmt(avail)}  limit ${fmt(a.credit_limit)}`, "muted")
      }
    }
    const totalOwed = cards.reduce((s, a) => s + Math.abs(a.balance), 0)
    if (cards.length > 1) {
      const bal = `-${fmt(totalOwed)}`
      const maxLabel = innerW - bal.length - 1
      push(rows, "row", `${"Total owed".padEnd(maxLabel)} ${bal}`, "error")
    }
  }

  // Debts
  if (data.debts.length > 0) {
    push(rows, "divider")
    push(rows, "header", "DEBTS", "accent")
    for (const d of data.debts) {
      const bal = fmt(d.balance)
      const rate = d.interest_rate ? `  ${d.interest_rate}%` : ""
      const minP = d.min_payment ? `  min ${fmt(d.min_payment)}` : ""
      const maxLabel = innerW - bal.length - 1
      const label = truncate(d.name, maxLabel).padEnd(maxLabel)
      push(rows, "row", `${label} ${bal}${rate}${minP}`, "warning")
    }
    const totalDebt = data.debts.reduce((s, d) => s + d.balance, 0)
    if (data.debts.length > 1) {
      const bal = fmt(totalDebt)
      const maxLabel = innerW - bal.length - 1
      push(rows, "row", `${"Total".padEnd(maxLabel)} ${bal}`, "muted")
    }
  }

  return rows
}

// ── Right column rows: budgets, goals, expenses, alerts, upcoming ──────────────

function buildRightRows(data: DashboardData, colW: number): Row[] {
  const rows: Row[] = []
  const innerW = colW - 3

  // Budgets
  if (data.budgets.length > 0) {
    const now = new Date()
    const dayOfMonth = now.getDate()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    push(rows, "header", `BUDGET — day ${dayOfMonth} of ${daysInMonth}`, "accent")
    for (const b of data.budgets) {
      const ratio = b.amount === 0 ? 0 : b.spent / b.amount
      const pct = `${Math.round(ratio * 100)}%`.padStart(4)
      const bar = progressBar(b.spent, b.amount, 8)
      const label = truncate(b.category, 14).padEnd(14)
      const color: Color = ratio >= 1 ? "error" : ratio >= 0.8 ? "warning" : "success"

      // Velocity warning
      let velocityTag = ""
      if (b.spent > 0 && ratio < 1 && dayOfMonth > 3) {
        const dailyBurn = b.spent / dayOfMonth
        const projected = dailyBurn * daysInMonth
        if (projected > b.amount) {
          const exhaustDay = Math.ceil(b.amount / dailyBurn)
          velocityTag = ` ⚡d${exhaustDay}`
        }
      }
      push(rows, "row", `${label} ${bar}${pct}${velocityTag}`, color)
    }
  }

  // Goals
  if (data.goals.length > 0) {
    push(rows, "divider")
    push(rows, "header", "GOALS", "accent")
    const now = Date.now()
    for (const g of data.goals) {
      const ratio = g.target_amount === 0 ? 1 : g.current_amount / g.target_amount
      const pct = `${Math.min(100, Math.round(ratio * 100))}%`.padStart(4)
      const bar = progressBar(g.current_amount, g.target_amount, 8)
      const maxLabel = innerW - bar.length - pct.length - 2
      const label = truncate(g.name, maxLabel).padEnd(maxLabel)
      const color: Color = ratio >= 1 ? "success" : "text"

      push(rows, "row", `${label} ${bar}${pct}`, color)

      // Pace sub-row
      if (g.target_date && ratio < 1) {
        const monthsLeft = Math.max(1, Math.round((g.target_date - now) / (30.44 * 24 * 60 * 60 * 1000)))
        const monthsElapsed = Math.max(1, Math.round((now - g.time_created) / (30.44 * 24 * 60 * 60 * 1000)))
        const remaining = g.target_amount - g.current_amount
        const requiredMonthly = remaining / monthsLeft
        const actualMonthly = g.current_amount / monthsElapsed
        const onTrack = actualMonthly >= requiredMonthly * 0.9
        const paceColor: Color = onTrack ? "success" : "warning"
        const due = new Date(g.target_date).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
        push(rows, "row", `  ${onTrack ? "✓" : "!"} ${fmt(requiredMonthly)}/mo · ${monthsLeft}mo left · ${due}`, paceColor)
      }
    }
  }

  // Top expenses
  if (data.topExpenses.length > 0) {
    push(rows, "divider")
    push(rows, "header", "TOP EXPENSES — THIS MONTH", "accent")
    const maxExpense = Math.max(...data.topExpenses.map((e) => e.amount), 1)
    for (const e of data.topExpenses.slice(0, 6)) {
      const amt = fmt(e.amount)
      const barW = Math.max(1, innerW - e.category.length - amt.length - 3)
      const filled = Math.round((e.amount / maxExpense) * barW)
      const bar = "█".repeat(filled) + "░".repeat(barW - filled)
      const label = truncate(e.category, 12).padEnd(12)
      push(rows, "row", `${label} ${bar} ${amt}`)
    }
  }

  // Alerts
  const critical = data.alerts.filter((a) => a.severity === "critical")
  const warnings = data.alerts.filter((a) => a.severity === "warning")
  if (data.alerts.length > 0) {
    push(rows, "divider")
    push(rows, "header", "ALERTS", "accent")
    for (const a of critical) push(rows, "row", `✖ ${truncate(a.message, innerW - 2)}`, "error")
    for (const a of warnings) push(rows, "row", `~ ${truncate(a.message, innerW - 2)}`, "warning")
  }

  // Upcoming bills
  if (data.upcoming.length > 0) {
    push(rows, "divider")
    push(rows, "header", "UPCOMING — NEXT 14 DAYS", "accent")
    for (const r of data.upcoming) {
      const date = new Date(r.next_due).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      const amt = fmt(r.amount)
      const sign = r.type === "expense" ? "-" : "+"
      const color: Color = r.type === "expense" ? "warning" : "success"
      const maxLabel = innerW - amt.length - sign.length - date.length - 3
      const label = truncate(r.title, Math.max(8, maxLabel)).padEnd(Math.max(8, maxLabel))
      push(rows, "row", `${date}  ${label} ${sign}${amt}`, color)
    }
  }

  return rows
}

// ── Dashboard route ────────────────────────────────────────────────────────────

export function DashboardRoute() {
  const { theme } = useTheme()
  const dims = useTerminalDimensions()
  const route = useRoute()

  const [data] = createResource(() => api.getDashboard())

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
      route.navigate({ type: "home" })
      return true
    }
    return false
  })

  const t = () => theme()

  const resolveColor = (color: Color | undefined) => {
    switch (color) {
      case "accent":  return t().accent
      case "success": return t().success
      case "error":   return t().error
      case "warning": return t().warning
      case "muted":   return t().textMuted
      default:        return t().text
    }
  }

  const colW = () => Math.floor(dims().width / 2)
  const rightX = () => colW()
  const contentH = () => dims().height - 3 // title bar + footer

  const leftRows = () => {
    if (!data()) return []
    const all = buildLeftRows(data()!, colW())
    return all.slice(0, contentH()).map((row, i) => ({ ...row, y: 1 + i }))
  }

  const rightRows = () => {
    if (!data()) return []
    const all = buildRightRows(data()!, dims().width - colW())
    return all.slice(0, contentH()).map((row, i) => ({ ...row, y: 1 + i }))
  }

  return (
    <>
      {/* Title bar */}
      <text position="absolute" top={0} left={0} fg={t().accent}>
        <span style={{ bold: true }}>{"  FINANCIAL DASHBOARD"}</span>
        <span style={{ fg: t().textMuted }}>{`  ·  q to go back`}</span>
      </text>

      {/* Divider line between title and content */}
      <text position="absolute" top={0} left={21} fg={t().border}>
        {""}
      </text>

      {/* Left column */}
      <Show when={data()}>
        <For each={leftRows()}>
          {(row) => {
            if (row.kind === "divider") {
              return (
                <text position="absolute" top={row.y} left={1} fg={t().border}>
                  {"─".repeat(colW() - 2)}
                </text>
              )
            }
            if (row.kind === "header") {
              return (
                <text position="absolute" top={row.y} left={1} fg={resolveColor(row.color)}>
                  <span style={{ bold: true }}>{"▌ "}{row.text}</span>
                </text>
              )
            }
            return (
              <text position="absolute" top={row.y} left={3} fg={resolveColor(row.color)}>
                {row.text}
              </text>
            )
          }}
        </For>

        {/* Vertical separator */}
        <For each={Array.from({ length: contentH() }, (_, i) => i)}>
          {(i) => (
            <text position="absolute" top={1 + i} left={colW()} fg={t().border}>
              {"│"}
            </text>
          )}
        </For>

        {/* Right column */}
        <For each={rightRows()}>
          {(row) => {
            if (row.kind === "divider") {
              return (
                <text position="absolute" top={row.y} left={rightX() + 1} fg={t().border}>
                  {"─".repeat(dims().width - colW() - 2)}
                </text>
              )
            }
            if (row.kind === "header") {
              return (
                <text position="absolute" top={row.y} left={rightX() + 1} fg={resolveColor(row.color)}>
                  <span style={{ bold: true }}>{"▌ "}{row.text}</span>
                </text>
              )
            }
            return (
              <text position="absolute" top={row.y} left={rightX() + 3} fg={resolveColor(row.color)}>
                {row.text}
              </text>
            )
          }}
        </For>
      </Show>

      {/* Loading state */}
      <Show when={!data()}>
        <text position="absolute" top={Math.floor(dims().height / 2)} left={Math.floor(dims().width / 2) - 7} fg={t().textMuted}>
          {"Loading..."}
        </text>
      </Show>

      {/* Footer */}
      <text position="absolute" top={dims().height - 1} left={1} fg={t().textMuted}>
        {"q  back"}
      </text>
    </>
  )
}
