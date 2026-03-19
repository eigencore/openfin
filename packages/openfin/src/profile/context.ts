import { Profile } from "./profile"

const fmt = (n: number, currency = "MXN") =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`

const pct = (current: number, total: number) =>
  total === 0 ? "0%" : `${Math.round((current / total) * 100)}%`

const statusEmoji = (ratio: number) => {
  if (ratio >= 1) return "🔴"
  if (ratio >= 0.8) return "⚠️ "
  return "✅"
}

/**
 * Builds a fresh financial profile context block to inject into the system prompt.
 * Called once per chat() invocation so the LLM always sees current balances/debts.
 * Returns an empty string if no profile data has been set up yet.
 */
export function buildFinancialContext(): string {
  const accounts = Profile.listAccounts()
  const debts = Profile.listDebts()
  const budgets = Profile.listBudgets()
  const goals = Profile.listGoals()

  if (!accounts.length && !debts.length && !budgets.length && !goals.length) return ""

  const lines: string[] = ["=== Tu perfil financiero ===", ""]

  // ── Accounts ────────────────────────────────────────────────────────────────
  if (accounts.length) {
    lines.push("CUENTAS")
    let totalAssets = 0
    for (const a of accounts) {
      const label = a.institution ? `${a.name} (${a.institution})` : a.name
      lines.push(`  ${label}: ${fmt(a.balance, a.currency)}`)
      totalAssets += a.balance
    }
    if (accounts.length > 1) {
      lines.push(`  Total activos: ${fmt(totalAssets)}`)
    }
    lines.push("")
  }

  // ── Debts ────────────────────────────────────────────────────────────────────
  if (debts.length) {
    lines.push("DEUDAS")
    let totalDebt = 0
    for (const d of debts) {
      const parts: string[] = [`  ${d.name}: ${fmt(d.balance, d.currency)}`]
      if (d.interest_rate) parts.push(`${d.interest_rate}% APR`)
      if (d.min_payment) parts.push(`pago mínimo ${fmt(d.min_payment, d.currency)}`)
      if (d.due_day) parts.push(`vence día ${d.due_day}`)
      lines.push(parts.join(" · "))
      totalDebt += d.balance
    }
    if (debts.length > 1) {
      lines.push(`  Total deuda: ${fmt(totalDebt)}`)
    }

    // Net worth
    const totalAssets = accounts.reduce((s, a) => s + a.balance, 0)
    const netWorth = totalAssets - totalDebt
    lines.push(`  Balance neto: ${fmt(netWorth)}`)
    lines.push("")
  }

  // ── Budgets + actual spending ─────────────────────────────────────────────
  if (budgets.length) {
    const now = new Date()
    const monthName = now.toLocaleString("es-MX", { month: "long", year: "numeric" })
    lines.push(`PRESUPUESTO — ${monthName}`)

    const spent = Profile.currentMonthExpensesByCategory()

    for (const b of budgets) {
      const usedAmount = spent.get(b.category.toLowerCase()) ?? 0
      const ratio = usedAmount / b.amount
      const emoji = statusEmoji(ratio)
      lines.push(
        `  ${emoji} ${b.category}: ${fmt(usedAmount, b.currency)} / ${fmt(b.amount, b.currency)} (${pct(usedAmount, b.amount)})`,
      )
    }

    // Categories with spending but no budget
    const unbudgeted = [...spent.entries()].filter(
      ([cat]) => !budgets.some((b) => b.category.toLowerCase() === cat.toLowerCase()),
    )
    for (const [cat, amount] of unbudgeted) {
      lines.push(`  ⚪ ${cat}: ${fmt(amount)} (sin presupuesto)`)
    }

    lines.push("")
  }

  // ── Goals ────────────────────────────────────────────────────────────────────
  if (goals.length) {
    lines.push("METAS")
    for (const g of goals) {
      const ratio = g.current_amount / g.target_amount
      const emoji = ratio >= 1 ? "✅" : "🎯"
      const datePart = g.target_date
        ? ` → ${new Date(g.target_date).toLocaleDateString("es-MX", { month: "short", year: "numeric" })}`
        : ""
      lines.push(
        `  ${emoji} ${g.name}: ${fmt(g.current_amount, g.currency)} / ${fmt(g.target_amount, g.currency)} (${pct(g.current_amount, g.target_amount)})${datePart}`,
      )
    }
    lines.push("")
  }

  return lines.join("\n")
}
