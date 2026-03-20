import z from "zod"
import { Tool } from "./tool"
import { Profile } from "../profile/profile"

const fmt = (n: number, currency = "MXN") =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency}`

// ── evaluate_purchase ─────────────────────────────────────────────────────────

export const PurchaseAdvisorTool = Tool.define("evaluate_purchase", {
  description:
    "Analyze whether a purchase is financially sound given the user's current financial situation. " +
    "Call this whenever the user asks 'should I buy X', 'can I afford Y', 'is it worth buying Z', " +
    "'quiero comprar X', 'me conviene comprar', or any similar purchase consideration. " +
    "Returns a structured analysis with liquidity check, budget headroom, debt priority, goals impact, " +
    "and a clear verdict. Use the output to give the user a well-informed recommendation.",

  parameters: z.object({
    item: z.string().describe("What the user wants to buy, e.g. 'iPhone 16 Pro', 'laptop', 'coche', 'sillón'"),
    price: z.number().describe("The price of the item"),
    currency: z.string().optional().describe("Currency code, defaults to MXN"),
    category: z
      .string()
      .optional()
      .describe("Spending category hint, e.g. 'electronics', 'transport', 'clothing'. Leave blank to auto-detect."),
    payment_method: z
      .enum(["cash", "credit_card", "installments", "unknown"])
      .optional()
      .describe("How the user plans to pay. 'installments' means meses sin intereses or similar."),
    notes: z.string().optional().describe("Any extra context the user mentioned, e.g. 'está en oferta', 'lo necesito para el trabajo', '18 MSI'"),
  }),

  async execute({ item, price, currency = "MXN", category, payment_method = "unknown", notes }) {
    const accounts = Profile.listAccounts()
    const debts = Profile.listDebts()
    const budgets = Profile.listBudgets()
    const goals = Profile.listGoals()
    const income = Profile.getIncome()
    const spent = Profile.currentMonthExpensesByCategory()

    const lines: string[] = []

    lines.push(`PURCHASE ANALYSIS: ${item}`)
    lines.push(`Price: ${fmt(price, currency)}`)
    if (payment_method !== "unknown") lines.push(`Payment: ${payment_method}`)
    if (notes) lines.push(`Context: ${notes}`)
    lines.push("")

    // ── 1. Liquidity ──────────────────────────────────────────────────────────

    const liquidAccounts = accounts.filter((a) => ["checking", "savings", "cash"].includes(a.type))
    const liquidTotal = liquidAccounts.reduce((s, a) => s + a.balance, 0)
    const safetyBuffer = income ? income.amount * 1.5 : price * 2
    const liquidAfterPurchase = liquidTotal - price

    lines.push("LIQUIDITY")
    lines.push(`  Liquid cash available: ${fmt(liquidTotal, currency)}`)

    if (payment_method !== "credit_card" && payment_method !== "installments") {
      lines.push(`  After purchase: ${fmt(liquidAfterPurchase, currency)}`)
      lines.push(`  Safety buffer target (1.5× monthly income): ${fmt(safetyBuffer, currency)}`)

      if (liquidTotal < price) {
        lines.push(`  ⛔ INSUFFICIENT FUNDS — short by ${fmt(price - liquidTotal, currency)}`)
      } else if (liquidAfterPurchase < safetyBuffer) {
        lines.push(`  ⚠️  Would drop below safety buffer by ${fmt(safetyBuffer - liquidAfterPurchase, currency)}`)
      } else {
        lines.push(`  ✅ Affordable — ${fmt(liquidAfterPurchase - safetyBuffer, currency)} above safety buffer`)
      }
    } else {
      // Credit / installments — check available credit
      const creditCards = accounts.filter((a) => a.type === "credit_card")
      const availableCredit = creditCards.reduce((s, a) => s + (a.credit_limit ? a.credit_limit - Math.abs(a.balance) : 0), 0)
      if (creditCards.length > 0) {
        lines.push(`  Available credit: ${fmt(availableCredit, currency)}`)
        if (availableCredit < price) {
          lines.push(`  ⚠️  Credit available may be insufficient — short by ${fmt(price - availableCredit, currency)}`)
        } else {
          lines.push(`  ✅ Credit available covers the purchase`)
        }
      }
    }
    lines.push("")

    // ── 2. Income ratio ───────────────────────────────────────────────────────

    if (income) {
      const pctOfIncome = (price / income.amount) * 100
      lines.push("INCOME RATIO")
      lines.push(`  Monthly income: ${fmt(income.amount, currency)}`)
      lines.push(`  Purchase is ${pctOfIncome.toFixed(1)}% of monthly income`)
      if (pctOfIncome <= 5) lines.push(`  ✅ Small purchase (≤5% of income)`)
      else if (pctOfIncome <= 20) lines.push(`  🟡 Moderate purchase (5–20% of income)`)
      else if (pctOfIncome <= 50) lines.push(`  ⚠️  Significant purchase (20–50% of income) — plan carefully`)
      else lines.push(`  ⛔ Major purchase (>50% of income) — requires careful planning`)
      lines.push("")
    }

    // ── 3. Budget headroom ────────────────────────────────────────────────────

    const itemWords = item.toLowerCase().split(/\s+/)
    const matchingBudget = budgets.find((b) => {
      const bCat = b.category.toLowerCase()
      if (category && bCat.includes(category.toLowerCase())) return true
      return itemWords.some((w) => w.length > 3 && bCat.includes(w))
    })

    lines.push("BUDGET")
    if (matchingBudget) {
      const usedAmount = spent.get(matchingBudget.category.toLowerCase()) ?? 0
      const headroom = matchingBudget.amount - usedAmount
      lines.push(`  Matched category: ${matchingBudget.category}`)
      lines.push(`  Spent this month: ${fmt(usedAmount, currency)} / ${fmt(matchingBudget.amount, currency)}`)
      lines.push(`  Remaining headroom: ${fmt(headroom, currency)}`)
      if (price <= headroom) {
        lines.push(`  ✅ Fits within budget headroom`)
      } else if (price <= matchingBudget.amount) {
        lines.push(`  ⚠️  Would exceed this month's remaining budget by ${fmt(price - headroom, currency)}`)
      } else {
        lines.push(`  ⛔ Exceeds entire monthly budget (${Math.round((price / matchingBudget.amount) * 100)}% of budget)`)
      }
    } else {
      lines.push(`  No matching budget category found`)
      if (budgets.length > 0) {
        const totalBudget = budgets.reduce((s, b) => s + b.amount, 0)
        const totalSpent = [...spent.values()].reduce((s, v) => s + v, 0)
        const unallocated = totalBudget - totalSpent
        lines.push(`  Overall budget headroom this month: ${fmt(unallocated, currency)}`)
      }
    }
    lines.push("")

    // ── 4. High-interest debt check ───────────────────────────────────────────

    const highInterestDebts = debts.filter((d) => d.interest_rate && d.interest_rate > 15)
    const creditCardBalances = accounts.filter((a) => a.type === "credit_card" && a.balance < 0)
    const totalHighInterestDebt =
      highInterestDebts.reduce((s, d) => s + d.balance, 0) +
      creditCardBalances.reduce((s, a) => s + Math.abs(a.balance), 0)

    if (totalHighInterestDebt > 0) {
      lines.push("DEBT PRIORITY")
      lines.push(`  High-interest / credit card debt: ${fmt(totalHighInterestDebt, currency)}`)
      if (price >= totalHighInterestDebt * 0.3) {
        lines.push(
          `  ⚠️  Purchase represents ${Math.round((price / totalHighInterestDebt) * 100)}% of outstanding high-interest debt`,
        )
        lines.push(`  Consider paying down debt first — guaranteed return equal to the interest rate`)
      } else {
        lines.push(`  ✅ Purchase is small relative to debt outstanding`)
      }
      lines.push("")
    }

    // ── 5. Goals impact ───────────────────────────────────────────────────────

    const activeGoals = goals.filter((g) => g.current_amount < g.target_amount)
    if (activeGoals.length > 0) {
      const totalSpent = [...spent.values()].reduce((s, v) => s + v, 0)
      const estimatedMonthlySavings = income ? Math.max(0, income.amount - totalSpent) : 0

      lines.push("GOALS IMPACT")

      if (estimatedMonthlySavings > 0) {
        const monthsOfSavings = price / estimatedMonthlySavings
        lines.push(`  Current monthly savings rate: ~${fmt(estimatedMonthlySavings, currency)}`)
        lines.push(`  This purchase ≈ ${monthsOfSavings.toFixed(1)} month(s) of savings`)
      }

      const urgentGoals = activeGoals.filter(
        (g) => g.target_date && g.target_date - Date.now() < 12 * 30.44 * 24 * 3600 * 1000,
      )
      if (urgentGoals.length > 0) {
        lines.push(`  ⚠️  ${urgentGoals.length} goal(s) due within 12 months:`)
        for (const g of urgentGoals.slice(0, 3)) {
          const rem = g.target_amount - g.current_amount
          const due = g.target_date
            ? new Date(g.target_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })
            : ""
          lines.push(`    · ${g.name}: ${fmt(rem, g.currency)} remaining${due ? ` (due ${due})` : ""}`)
        }
      } else {
        lines.push(`  ✅ No urgent goals within 12 months`)
      }
      lines.push("")
    }

    // ── 6. Installments suggestion ────────────────────────────────────────────

    const availableCards = accounts.filter(
      (a) => a.type === "credit_card" && a.credit_limit && a.credit_limit - Math.abs(a.balance) >= price,
    )
    if (
      payment_method !== "installments" &&
      availableCards.length > 0 &&
      income &&
      price > income.amount * 0.15
    ) {
      const monthly12 = price / 12
      const monthly18 = price / 18
      lines.push("INSTALLMENTS OPTION")
      lines.push(`  If 12 MSI available: ${fmt(monthly12, currency)}/mo`)
      lines.push(`  If 18 MSI available: ${fmt(monthly18, currency)}/mo`)
      if (income) {
        lines.push(
          `  12 MSI = ${((monthly12 / income.amount) * 100).toFixed(1)}% of income per month`,
        )
      }
      lines.push("")
    }

    // ── 7. Verdict ────────────────────────────────────────────────────────────

    const canAfford =
      payment_method === "credit_card" || payment_method === "installments" ? true : liquidTotal >= price
    const aboveBuffer =
      payment_method === "credit_card" || payment_method === "installments"
        ? true
        : liquidAfterPurchase >= safetyBuffer
    const hasUrgentGoals = activeGoals.some(
      (g) => g.target_date && g.target_date - Date.now() < 6 * 30.44 * 24 * 3600 * 1000,
    )
    const seriousDebtConflict = totalHighInterestDebt > 0 && price >= totalHighInterestDebt * 0.5

    let verdict: string
    let verdictEmoji: string

    if (!canAfford) {
      verdictEmoji = "❌"
      verdict = "NO ALCANZA — fondos líquidos insuficientes"
    } else if (seriousDebtConflict && !aboveBuffer) {
      verdictEmoji = "❌"
      verdict = "EVITAR — drenaría el colchón financiero y tienes deuda de alto interés pendiente"
    } else if (!aboveBuffer) {
      verdictEmoji = "⏳"
      verdict = "ESPERAR — la compra dejaría fondos por debajo del colchón de seguridad"
    } else if (hasUrgentGoals && income && price > income.amount * 0.3) {
      verdictEmoji = "⚠️"
      verdict = "PRECAUCIÓN — tienes metas urgentes en los próximos 6 meses"
    } else if (seriousDebtConflict) {
      verdictEmoji = "⚠️"
      verdict = "PRECAUCIÓN — considera liquidar deuda de alto interés primero"
    } else {
      verdictEmoji = "✅"
      verdict = "ADELANTE — financieramente viable"
    }

    lines.push(`VERDICT: ${verdictEmoji} ${verdict}`)

    return {
      title: `Purchase advisor: ${item} (${fmt(price, currency)})`,
      output: lines.join("\n"),
    }
  },
})
