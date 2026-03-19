import z from "zod"
import { Tool } from "./tool"
import { Profile } from "../profile/profile"

const fmt = (n: number, currency = "MXN") =>
  `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`

// ── upsert_account ────────────────────────────────────────────────────────────

export const UpsertAccountTool = Tool.define("upsert_account", {
  description:
    "Create or update a bank/savings/investment account. " +
    "If an account with the same name already exists it will be updated. " +
    "Use this when the user mentions their account balances or opens a new account.",

  parameters: z.object({
    name: z.string().describe("Account name, e.g. 'Banamex nómina', 'BBVA ahorro'"),
    type: z
      .enum(["checking", "savings", "investment", "cash", "other"])
      .describe("Account type"),
    balance: z.number().describe("Current balance (positive number)"),
    currency: z.string().optional().describe("Currency code, default MXN"),
    institution: z.string().optional().describe("Bank or institution name"),
    notes: z.string().optional(),
  }),

  async execute({ name, type, balance, currency, institution, notes }) {
    const account = Profile.upsertAccount({ name, type, balance, currency, institution, notes })
    return {
      title: `Cuenta: ${name}`,
      output: `Cuenta "${name}" guardada. Saldo: ${fmt(account.balance, account.currency)}`,
    }
  },
})

// ── upsert_debt ───────────────────────────────────────────────────────────────

export const UpsertDebtTool = Tool.define("upsert_debt", {
  description:
    "Create or update a debt (credit card, loan, mortgage, etc.). " +
    "If a debt with the same name already exists it will be updated. " +
    "Use this when the user mentions a debt balance, payment, or new loan.",

  parameters: z.object({
    name: z.string().describe("Debt name, e.g. 'Tarjeta Banamex', 'Crédito auto BBVA'"),
    type: z.enum(["credit_card", "loan", "mortgage", "other"]).describe("Debt type"),
    balance: z.number().describe("Outstanding balance owed (positive number)"),
    interest_rate: z.number().optional().describe("Annual interest rate (APR) as a percentage, e.g. 19.9"),
    min_payment: z.number().optional().describe("Minimum monthly payment"),
    due_day: z.number().int().min(1).max(31).optional().describe("Day of month payment is due"),
    currency: z.string().optional().describe("Currency code, default MXN"),
    institution: z.string().optional(),
    notes: z.string().optional(),
  }),

  async execute({ name, type, balance, interest_rate, min_payment, due_day, currency, institution, notes }) {
    const debt = Profile.upsertDebt({ name, type, balance, interest_rate, min_payment, due_day, currency, institution, notes })
    const parts = [`Deuda "${name}" guardada. Saldo: ${fmt(debt.balance, debt.currency)}`]
    if (debt.interest_rate) parts.push(`${debt.interest_rate}% APR`)
    if (debt.due_day) parts.push(`vence día ${debt.due_day}`)
    return {
      title: `Deuda: ${name}`,
      output: parts.join(" · "),
    }
  },
})

// ── upsert_budget ─────────────────────────────────────────────────────────────

export const UpsertBudgetTool = Tool.define("upsert_budget", {
  description:
    "Create or update a spending budget for a category (food, transport, entertainment, etc.). " +
    "If a budget for the same category already exists it will be updated.",

  parameters: z.object({
    category: z.string().describe("Spending category, e.g. 'Comida', 'Transporte', 'Entretenimiento'"),
    amount: z.number().describe("Budget limit for this category"),
    period: z.enum(["monthly", "weekly"]).optional().describe("Budget period, default monthly"),
    currency: z.string().optional().describe("Currency code, default MXN"),
    notes: z.string().optional(),
  }),

  async execute({ category, amount, period, currency, notes }) {
    const budget = Profile.upsertBudget({ category, amount, period, currency, notes })
    return {
      title: `Presupuesto: ${category}`,
      output: `Presupuesto "${category}" guardado: ${fmt(budget.amount, budget.currency)} / ${budget.period === "monthly" ? "mes" : "semana"}`,
    }
  },
})

// ── upsert_goal ───────────────────────────────────────────────────────────────

export const UpsertGoalTool = Tool.define("upsert_goal", {
  description:
    "Create or update a financial goal (emergency fund, vacation, down payment, etc.). " +
    "Can also update progress on an existing goal.",

  parameters: z.object({
    name: z.string().describe("Goal name, e.g. 'Fondo de emergencia', 'Viaje a Japón'"),
    target_amount: z.number().describe("Target amount to reach"),
    current_amount: z.number().optional().describe("Current amount saved toward this goal"),
    target_date: z
      .string()
      .optional()
      .describe("Target date in ISO format (YYYY-MM-DD), e.g. '2026-12-31'"),
    currency: z.string().optional().describe("Currency code, default MXN"),
    notes: z.string().optional(),
  }),

  async execute({ name, target_amount, current_amount, target_date, currency, notes }) {
    const targetTs = target_date ? new Date(target_date).getTime() : undefined
    const goal = Profile.upsertGoal({ name, target_amount, current_amount, target_date: targetTs, currency, notes })
    const pct = Math.round((goal.current_amount / goal.target_amount) * 100)
    const datePart = goal.target_date
      ? ` · meta: ${new Date(goal.target_date).toLocaleDateString("es-MX", { month: "short", year: "numeric" })}`
      : ""
    return {
      title: `Meta: ${name}`,
      output: `Meta "${name}" guardada. Progreso: ${fmt(goal.current_amount, goal.currency)} / ${fmt(goal.target_amount, goal.currency)} (${pct}%)${datePart}`,
    }
  },
})

// ── log_transaction ───────────────────────────────────────────────────────────

export const LogTransactionTool = Tool.define("log_transaction", {
  description:
    "Log an income or expense transaction and automatically update the linked account balance. " +
    "IMPORTANT: If the user has multiple accounts, always ask which account was used before calling this tool. " +
    "If there is only one account, use it automatically. " +
    "Use this when the user mentions spending money, receiving income, paying bills, or making transfers.",

  parameters: z.object({
    amount: z.number().positive().describe("Transaction amount (always positive)"),
    type: z.enum(["income", "expense"]).describe("Whether this is income or an expense"),
    category: z
      .string()
      .describe(
        "Category: Comida, Transporte, Entretenimiento, Salud, Ropa, Servicios, Nómina, Freelance, etc.",
      ),
    description: z.string().describe("Short description of the transaction"),
    date: z
      .string()
      .optional()
      .describe("Date in ISO format (YYYY-MM-DD). Defaults to today if omitted."),
    account_name: z
      .string()
      .optional()
      .describe(
        "Name of the account to debit/credit. The account balance will be updated automatically. " +
        "Ask the user if unclear and they have multiple accounts.",
      ),
    currency: z.string().optional().describe("Currency code, default MXN"),
  }),

  async execute({ amount, type, category, description, date, account_name, currency }, _ctx) {
    const dateTs = date ? new Date(date).getTime() : Date.now()

    // Resolve account_id by name if provided
    let account_id: string | undefined
    let resolvedAccountName: string | undefined

    const accounts = Profile.listAccounts()
    if (account_name) {
      const found = accounts.find((a) => a.name.toLowerCase() === account_name.toLowerCase())
      if (found) {
        account_id = found.id
        resolvedAccountName = found.name
      }
    } else if (accounts.length === 1 && accounts[0]) {
      // Only one account — use it automatically
      account_id = accounts[0].id
      resolvedAccountName = accounts[0].name
    }

    const { transaction: tx, newAccountBalance } = Profile.logTransaction({
      amount,
      type,
      category,
      description,
      date: dateTs,
      account_id,
      currency,
    })

    const dateStr = new Date(tx.date).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
    const direction = type === "expense" ? "Gasto" : "Ingreso"

    const parts = [
      `${direction} registrado: ${fmt(tx.amount, tx.currency)} en ${category} — "${description}" (${dateStr})`,
    ]
    if (resolvedAccountName && newAccountBalance !== undefined) {
      parts.push(`Nuevo saldo de "${resolvedAccountName}": ${fmt(newAccountBalance, tx.currency)}`)
    }

    return {
      title: `${direction}: ${description}`,
      output: parts.join("\n"),
    }
  },
})

// ── analyze_expenses ──────────────────────────────────────────────────────────

export const AnalyzeExpensesTool = Tool.define("analyze_expenses", {
  description:
    "Analyze spending by category for a given period. " +
    "Use this when the user asks about their spending habits, where their money goes, " +
    "or wants a breakdown of expenses.",

  parameters: z.object({
    period: z
      .enum(["this_month", "last_month", "last_30_days", "this_year"])
      .describe("Time period to analyze"),
    type: z
      .enum(["income", "expense"])
      .optional()
      .describe("Filter by income or expense. Defaults to expenses if omitted."),
  }),

  async execute({ period, type }) {
    const effectiveType = type ?? "expense"
    const results = Profile.analyzeExpenses({ period, type: effectiveType })

    if (!results.length) {
      return {
        title: "Análisis de gastos",
        output: `No hay ${effectiveType === "expense" ? "gastos" : "ingresos"} registrados para ${period}.`,
      }
    }

    const total = results.reduce((s, r) => s + r.total, 0)
    const currency = results[0]?.currency ?? "MXN"

    const periodLabel: Record<string, string> = {
      this_month: "este mes",
      last_month: "el mes pasado",
      last_30_days: "últimos 30 días",
      this_year: "este año",
    }

    const lines = [
      `${effectiveType === "expense" ? "Gastos" : "Ingresos"} — ${periodLabel[period]}`,
      "",
    ]

    for (const r of results) {
      const share = Math.round((r.total / total) * 100)
      lines.push(`  ${r.category}: ${fmt(r.total, r.currency)} (${share}%, ${r.count} transacciones)`)
    }

    lines.push("", `  Total: ${fmt(total, currency)}`)

    return {
      title: `Análisis: ${periodLabel[period]}`,
      output: lines.join("\n"),
    }
  },
})

export const ProfileTools = [
  UpsertAccountTool,
  UpsertDebtTool,
  UpsertBudgetTool,
  UpsertGoalTool,
  LogTransactionTool,
  AnalyzeExpensesTool,
]
