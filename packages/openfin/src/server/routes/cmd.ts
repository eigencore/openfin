import { Hono } from "hono"
import { lazy } from "../../util/lazy"
import { Profile } from "../../profile/profile"

const fmt = (n: number, currency = "MXN") =>
  `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`

const PERIODS = ["this_month", "last_month", "last_30_days", "this_year"] as const
type Period = (typeof PERIODS)[number]

function isPeriod(s: string): s is Period {
  return PERIODS.includes(s as Period)
}

function periodLabel(p: Period): string {
  return { this_month: "This month", last_month: "Last month", last_30_days: "Last 30 days", this_year: "This year" }[p]
}

// ── Command handlers ──────────────────────────────────────────────────────────

function cmdAccounts(): string {
  const accounts = Profile.listAccounts()
  if (!accounts.length) return "No accounts registered."

  const regular = accounts.filter((a) => a.type !== "credit_card")
  const creditCards = accounts.filter((a) => a.type === "credit_card")
  const lines: string[] = [`Accounts (${accounts.length})`]

  if (regular.length) {
    lines.push("")
    lines.push("  ── Assets ───────────────────────────────────────────")
    for (const a of regular) {
      const balStr = `\x1b[32m${fmt(a.balance, a.currency)}\x1b[0m`
      const typeLabel = a.type !== "checking" && a.type !== "savings" ? `  [${a.type}]` : ""
      const institution = a.institution ? `  ${a.institution}` : ""
      lines.push(`  ${a.name.padEnd(24)} ${balStr}${typeLabel}${institution}`)
    }
    if (regular.length > 1) {
      const total = regular.reduce((s, a) => s + a.balance, 0)
      lines.push(`  ${"Total assets".padEnd(24)} ${fmt(total)}`)
    }
  }

  if (creditCards.length) {
    lines.push("")
    lines.push("  ── Credit Cards ─────────────────────────────────────")
    for (const a of creditCards) {
      const owed = Math.abs(a.balance)
      const owedStr = owed > 0 ? `-${fmt(owed, a.currency)}` : `$0.00 ${a.currency}`
      const parts: string[] = [owedStr]
      if (a.credit_limit) {
        parts.push(`limit ${fmt(a.credit_limit, a.currency)}`)
        parts.push(`avail ${fmt(a.credit_limit - owed, a.currency)}`)
      }
      if (a.institution) parts.push(a.institution)
      lines.push(`  ${a.name.padEnd(24)} ${parts.join("  ·  ")}`)
    }
    if (creditCards.length > 1) {
      const totalOwed = creditCards.reduce((s, a) => s + Math.abs(a.balance), 0)
      lines.push(`  ${"Total owed".padEnd(24)} -${fmt(totalOwed)}`)
    }
  }

  const totalAssets = regular.reduce((s, a) => s + a.balance, 0)
  const totalOwed = creditCards.reduce((s, a) => s + Math.abs(a.balance), 0)
  const debts = Profile.listDebts()
  const totalDebt = debts.reduce((s, d) => s + d.balance, 0)
  const netWorth = totalAssets - totalOwed - totalDebt
  const nwColor = netWorth >= 0 ? "\x1b[32m" : "\x1b[31m"
  lines.push("")
  lines.push(`  ${"Net worth".padEnd(24)} ${nwColor}${fmt(netWorth)}\x1b[0m`)

  return lines.join("\n")
}

function cmdDebts(): string {
  const debts = Profile.listDebts()
  if (!debts.length) return "No debts registered."
  const total = debts.reduce((s, d) => s + d.balance, 0)
  const lines = debts.map((d) => {
    const due = d.due_day ? `  due day ${d.due_day}` : ""
    const minPay = d.min_payment ? `  min ${fmt(d.min_payment, d.currency)}` : ""
    return `  ${d.name.padEnd(24)} \x1b[31m${fmt(d.balance, d.currency)}\x1b[0m${due}${minPay}`
  })
  lines.push(`  ${"TOTAL".padEnd(24)} \x1b[31m${fmt(total)}\x1b[0m`)
  return `Debts (${debts.length})\n${lines.join("\n")}`
}

function cmdBudgets(): string {
  const budgets = Profile.listBudgets()
  if (!budgets.length) return "No budgets configured."
  const spent = Profile.currentMonthExpensesByCategory()
  const lines = budgets.map((b) => {
    const usedAmt = spent.get(b.category.toLowerCase()) ?? 0
    const pct = b.amount === 0 ? 0 : Math.round((usedAmt / b.amount) * 100)
    const color = pct >= 100 ? "\x1b[31m" : pct >= 80 ? "\x1b[33m" : "\x1b[32m"
    return `  ${b.category.padEnd(20)} ${color}${String(pct).padStart(3)}%\x1b[0m  ${fmt(usedAmt, b.currency)} / ${fmt(b.amount, b.currency)}`
  })
  return `Budgets — this month\n${lines.join("\n")}`
}

function cmdGoals(): string {
  const goals = Profile.listGoals()
  if (!goals.length) return "No goals configured."
  const lines = goals.map((g) => {
    const pct = g.target_amount === 0 ? 100 : Math.round((g.current_amount / g.target_amount) * 100)
    const due = g.target_date ? `  → ${new Date(g.target_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""
    return `  ${g.name.padEnd(24)} ${pct}%  ${fmt(g.current_amount, g.currency)} / ${fmt(g.target_amount, g.currency)}${due}`
  })
  return `Goals (${goals.length})\n${lines.join("\n")}`
}

function cmdRecurring(): string {
  const items = Profile.listRecurring()
  if (!items.length) return "No recurring transactions configured."
  const lines = items.map((r) => {
    const dir = r.type === "expense" ? "\x1b[31m↓\x1b[0m" : "\x1b[32m↑\x1b[0m"
    const status = r.active ? "" : " \x1b[90m[paused]\x1b[0m"
    const next = new Date(r.next_due).toLocaleDateString("en-US", { day: "2-digit", month: "short" })
    return `  ${r.title.padEnd(24)} ${dir} ${fmt(r.amount, r.currency)}  ${r.frequency}  next: ${next}${status}`
  })
  return `Recurring (${items.length})\n${lines.join("\n")}`
}

function cmdNetWorth(): string {
  const accounts = Profile.listAccounts()
  const debts = Profile.listDebts()
  const assets = accounts.reduce((s, a) => s + a.balance, 0)
  const totalDebts = debts.reduce((s, d) => s + d.balance, 0)
  const net = assets - totalDebts
  const history = Profile.getNetWorthHistory(2)
  const delta = history.length >= 2 ? history[0]!.net_worth - history[1]!.net_worth : undefined

  const netColor = net >= 0 ? "\x1b[32m" : "\x1b[31m"
  const deltaStr =
    delta !== undefined
      ? `\n  Change vs previous  ${delta >= 0 ? "\x1b[32m+" : "\x1b[31m"}${fmt(delta)}\x1b[0m`
      : ""

  return [
    `Net Worth`,
    `  Assets              \x1b[32m${fmt(assets)}\x1b[0m`,
    `  Debts               \x1b[31m${fmt(totalDebts)}\x1b[0m`,
    `  Net worth           ${netColor}${fmt(net)}\x1b[0m${deltaStr}`,
  ].join("\n")
}

function cmdAlerts(): string {
  const alerts = Profile.getAlerts()
  if (!alerts.length) return "\x1b[32mNo active alerts.\x1b[0m"
  const lines = alerts.map((a) => {
    const color = a.severity === "critical" ? "\x1b[31m" : "\x1b[33m"
    const icon = a.severity === "critical" ? "✖" : "⚠"
    return `  ${color}${icon}\x1b[0m ${a.message}`
  })
  return `Alerts (${alerts.length})\n${lines.join("\n")}`
}

function cmdSpending(args: string[]): string {
  const period: Period = args[0] && isPeriod(args[0]) ? args[0] : "this_month"
  const summary = Profile.analyzeExpenses({ period, type: "expense" })
  if (!summary.length) return `No expenses for ${periodLabel(period)}.`
  const total = summary.reduce((s, e) => s + e.total, 0)
  const lines = summary.map((e) => {
    const pct = total === 0 ? 0 : Math.round((e.total / total) * 100)
    return `  ${e.category.padEnd(20)} ${fmt(e.total, e.currency).padStart(18)}  ${String(pct).padStart(3)}%  (${e.count} txs)`
  })
  lines.push(`  ${"TOTAL".padEnd(20)} ${fmt(total).padStart(18)}`)
  return `Spending — ${periodLabel(period)}\n${lines.join("\n")}`
}

function cmdTxs(args: string[]): string {
  let period: Period = "this_month"
  let type: "income" | "expense" | undefined
  let category: string | undefined
  let account_name: string | undefined

  for (const arg of args) {
    if (isPeriod(arg)) { period = arg; continue }
    if (arg === "income" || arg === "expense") { type = arg; continue }
    if (arg.startsWith("@")) { account_name = arg.slice(1); continue }
    category = arg
  }

  const accounts = Profile.listAccounts()
  const accountById = new Map(accounts.map((a) => [a.id, a.name]))
  let account_id: string | undefined
  if (account_name) {
    const found = accounts.find((a) => a.name.toLowerCase() === account_name!.toLowerCase())
    account_id = found?.id
  }

  const txs = Profile.listTransactions({ period, type, category, account_id, limit: 50 })
  if (!txs.length) return `No transactions found.`

  const lines = txs.map((tx) => {
    const dateStr = new Date(tx.date).toLocaleDateString("en-US", { day: "2-digit", month: "short" })
    const dir = tx.type === "expense" ? "\x1b[31m↓\x1b[0m" : "\x1b[32m↑\x1b[0m"
    const acct = tx.account_id ? ` \x1b[90m[${accountById.get(tx.account_id) ?? tx.account_id}]\x1b[0m` : ""
    return `  \x1b[90m${tx.id}\x1b[0m  ${dateStr} ${dir} ${fmt(tx.amount, tx.currency)} · ${tx.category} — ${tx.description}${acct}`
  })
  return `Transactions — ${periodLabel(period)}${type ? ` (${type})` : ""}${category ? ` · ${category}` : ""}\n${lines.join("\n")}`
}

function cmdDeleteTx(args: string[]): string {
  const id = args[0]
  if (!id) return "Usage: /delete-tx <id>"
  const result = Profile.deleteTransaction(id)
  if (!result.found) return `No transaction found with ID "${id}".`
  const revert =
    result.revertedAccountBalance !== undefined
      ? `\nAccount balance reverted to ${fmt(result.revertedAccountBalance)}.`
      : ""
  return `Transaction deleted.${revert}`
}

const HELP = `
Available commands:

  /accounts                                — list all accounts and balances
  /debts                                   — list debts
  /budgets                                 — budgets + current month spending
  /goals                                   — savings goals
  /recurring                               — recurring transactions
  /networth                                — net worth summary
  /alerts                                  — active alerts
  /spending [period]                       — expense breakdown by category
  /txs [period] [income|expense] [cat] [@account]  — list transactions
  /delete-tx <id>                          — delete a transaction by ID

  Periods: this_month · last_month · last_30_days · this_year
  Examples:
    /txs last_month expense food
    /txs this_year @Nu Débito
    /spending last_30_days
`.trim()

// ── Route ─────────────────────────────────────────────────────────────────────

export const CmdRoutes = lazy(() =>
  new Hono().post("/", async (c) => {
    const body = await c.req.json<{ command: string; args: string[] }>()
    const { command, args = [] } = body

    let output: string

    switch (command) {
      case "accounts":   output = cmdAccounts(); break
      case "debts":      output = cmdDebts(); break
      case "budgets":    output = cmdBudgets(); break
      case "goals":      output = cmdGoals(); break
      case "recurring":  output = cmdRecurring(); break
      case "networth":   output = cmdNetWorth(); break
      case "alerts":     output = cmdAlerts(); break
      case "spending":   output = cmdSpending(args); break
      case "txs":        output = cmdTxs(args); break
      case "delete-tx":  output = cmdDeleteTx(args); break
      case "help":       output = HELP; break
      default:           return c.json({ error: `Unknown command: ${command}. Type /help for the list.` }, 400)
    }

    return c.json({ output })
  }),
)
