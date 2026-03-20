import { For } from "solid-js"
import type { DashboardData } from "../context/sdk"
import type { Theme } from "../context/theme"

// ── Formatting helpers ────────────────────────────────────────────────────────

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
  // Sample or pad to fit width
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

// ── Row types ─────────────────────────────────────────────────────────────────

type RowKind = "header" | "row" | "divider" | "empty"

interface Row {
  kind: RowKind
  text: string
  color?: "text" | "muted" | "accent" | "success" | "error" | "warning"
}

// ── Build rows from data ──────────────────────────────────────────────────────

function buildRows(data: DashboardData, innerW: number): Row[] {
  const rows: Row[] = []

  const push = (kind: RowKind, text = "", color: Row["color"] = "text") =>
    rows.push({ kind, text, color })

  const nw = data.netWorth

  // ── Net worth ─────────────────────────────────────────────────────────────
  push("header", "NET WORTH", "accent")
  push("row", `Total:   ${fmt(nw.net_worth)} ${nw.currency}`, nw.net_worth >= 0 ? "success" : "error")
  push("row", `Assets:  ${fmt(nw.assets)}`)
  push("row", `Debts:   ${fmt(nw.debts)}`)
  if (nw.delta !== undefined) {
    const sign = nw.delta >= 0 ? "+" : ""
    push("row", `Change:  ${sign}${fmt(nw.delta)}`, nw.delta >= 0 ? "success" : "error")
  }

  // ── Net worth sparkline ────────────────────────────────────────────────────
  if ((data.netWorthHistory?.length ?? 0) > 2) {
    const values = data.netWorthHistory.map((h) => h.value)
    const spark = sparkline(values, innerW - 4)
    const trend = values[values.length - 1]! >= values[0]! ? "success" : "error"
    push("row", `↗  ${spark}`, trend)
  }

  // ── Top expenses ──────────────────────────────────────────────────────────
  if ((data.topExpenses?.length ?? 0) > 0) {
    push("divider")
    push("header", "MONTHLY EXPENSES", "accent")
    const maxExpense = Math.max(...data.topExpenses.map((e) => e.amount), 1)
    for (const e of data.topExpenses.slice(0, 5)) {
      const amt = fmt(e.amount)
      const barW = Math.max(1, innerW - e.category.length - amt.length - 3)
      const filled = Math.round((e.amount / maxExpense) * barW)
      const bar = "█".repeat(filled) + "░".repeat(barW - filled)
      const label = truncate(e.category, 10).padEnd(10)
      push("row", `${label} ${bar} ${amt}`)
    }
  }

  // ── Alerts ────────────────────────────────────────────────────────────────
  const critical = data.alerts.filter((a) => a.severity === "critical").slice(0, 2)
  const warnings = data.alerts.filter((a) => a.severity === "warning").slice(0, 2)
  if (data.alerts.length > 0) {
    push("divider")
    push("header", "ALERTS", "accent")
    for (const a of critical) push("row", `! ${truncate(a.message, innerW - 2)}`, "error")
    for (const a of warnings) push("row", `~ ${truncate(a.message, innerW - 2)}`, "warning")
  }

  // ── Accounts ──────────────────────────────────────────────────────────────
  const assets = data.accounts.filter((a) => a.type !== "credit_card")
  const cards = data.accounts.filter((a) => a.type === "credit_card")
  if (data.accounts.length > 0) {
    push("divider")
    push("header", "ACCOUNTS", "accent")
    for (const a of assets.slice(0, 4)) {
      const bal = fmt(a.balance)
      const maxLabel = innerW - bal.length - 1
      const label = truncate(a.name, maxLabel).padEnd(maxLabel)
      push("row", `${label} ${bal}`, "success")
    }
    if (cards.length > 0) {
      for (const a of cards.slice(0, 2)) {
        const owed = Math.abs(a.balance)
        const bal = owed > 0 ? `-${fmt(owed)}` : fmt(0)
        const maxLabel = innerW - bal.length - 1
        const label = truncate(a.name, maxLabel).padEnd(maxLabel)
        push("row", `${label} ${bal}`, owed > 0 ? "error" : "success")
      }
    }
  }

  // ── Budgets ───────────────────────────────────────────────────────────────
  if (data.budgets.length > 0) {
    push("divider")
    push("header", "BUDGET", "accent")
    for (const b of data.budgets.slice(0, 4)) {
      const ratio = b.amount === 0 ? 0 : b.spent / b.amount
      const pct = `${Math.round(ratio * 100)}%`.padStart(4)
      const bar = progressBar(b.spent, b.amount, 8)
      const maxLabel = innerW - bar.length - pct.length - 2
      const label = truncate(b.category, maxLabel).padEnd(maxLabel)
      const color: Row["color"] = ratio >= 1 ? "error" : ratio >= 0.8 ? "warning" : "success"
      push("row", `${label} ${bar}${pct}`, color)
    }
  }

  // ── Goals ─────────────────────────────────────────────────────────────────
  if (data.goals.length > 0) {
    push("divider")
    push("header", "GOALS", "accent")
    for (const g of data.goals.slice(0, 3)) {
      const pct = `${Math.min(100, g.target_amount === 0 ? 100 : Math.round((g.current_amount / g.target_amount) * 100))}%`.padStart(4)
      const bar = progressBar(g.current_amount, g.target_amount, 8)
      const maxLabel = innerW - bar.length - pct.length - 2
      const label = truncate(g.name, maxLabel).padEnd(maxLabel)
      push("row", `${label} ${bar}${pct}`)
    }
  }

  // ── Debts ─────────────────────────────────────────────────────────────────
  if (data.debts.length > 0) {
    push("divider")
    push("header", "DEBTS", "accent")
    for (const d of data.debts.slice(0, 3)) {
      const bal = fmt(d.balance)
      const maxLabel = innerW - bal.length - 1
      const label = truncate(d.name, maxLabel).padEnd(maxLabel)
      push("row", `${label} ${bal}`, "warning")
    }
  }

  return rows
}

// ── Dashboard panel component ─────────────────────────────────────────────────

interface Props {
  data: DashboardData
  theme: Theme
  x: number
  y: number
  width: number
  height: number
}

export function DashboardPanel(props: Props) {
  const t = () => props.theme
  const innerW = () => props.width - 2

  const resolveColor = (color: Row["color"]) => {
    const theme = t()
    switch (color) {
      case "accent": return theme.accent
      case "success": return theme.success
      case "error": return theme.error
      case "warning": return theme.warning
      case "muted": return theme.textMuted
      default: return theme.text
    }
  }

  // Build all rows as a flat array — deterministic, no reactive side-effects
  const rows = () => {
    const all = buildRows(props.data, innerW())
    return all.slice(0, props.height).map((row, i) => ({ ...row, y: props.y + i }))
  }

  return (
    <For each={rows()}>
      {(row) => {
        if (row.kind === "divider") {
          return (
            <text position="absolute" top={row.y} left={props.x} fg={t().border}>
              {"─".repeat(innerW())}
            </text>
          )
        }
        if (row.kind === "header") {
          return (
            <text position="absolute" top={row.y} left={props.x} fg={resolveColor(row.color)}>
              <span style={{ bold: true }}>▌ {row.text}</span>
            </text>
          )
        }
        return (
          <text position="absolute" top={row.y} left={props.x + 2} fg={resolveColor(row.color)}>
            {row.text}
          </text>
        )
      }}
    </For>
  )
}
