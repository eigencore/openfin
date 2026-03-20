import z from "zod"
import { Tool } from "./tool"
import { Profile } from "../profile/profile"
import { normalizeCategory, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../profile/categories"

const fmt = (n: number, currency = "MXN") =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`

// ── upsert_account ────────────────────────────────────────────────────────────

export const UpsertAccountTool = Tool.define("upsert_account", {
  description:
    "Create or update an account — bank accounts, savings, investments, cash, OR credit cards. " +
    "Credit cards use type 'credit_card' with a negative balance representing what is owed (e.g. -2500 means $2,500 owed). " +
    "If an account with the same name already exists it will be updated. " +
    "Use this when the user mentions their account balances, opens a new account, or registers a credit card.",

  parameters: z.object({
    name: z.string().describe("Account name, e.g. 'Banamex nómina', 'BBVA ahorro', 'Banamex Crédito'"),
    type: z
      .enum(["checking", "savings", "investment", "cash", "credit_card", "other"])
      .describe("Account type. Use 'credit_card' for credit cards."),
    balance: z
      .number()
      .describe(
        "Current balance. Use NEGATIVE for credit cards (e.g. -2500 means $2,500 owed). Use positive for all other account types.",
      ),
    credit_limit: z.number().optional().describe("Credit limit — only for credit_card type, e.g. 50000"),
    currency: z.string().optional().describe("Currency code, default MXN"),
    institution: z.string().optional().describe("Bank or institution name"),
    notes: z.string().optional(),
  }),

  async execute({ name, type, balance, credit_limit, currency, institution, notes }) {
    const account = Profile.upsertAccount({ name, type, balance, credit_limit, currency, institution, notes })
    const balanceLine =
      account.type === "credit_card"
        ? `Balance owed: ${fmt(Math.abs(account.balance), account.currency)}${account.credit_limit ? ` / limit ${fmt(account.credit_limit, account.currency)}` : ""}`
        : `Balance: ${fmt(account.balance, account.currency)}`
    return {
      title: `Account: ${name}`,
      output: `Account "${name}" saved. ${balanceLine}`,
    }
  },
})

// ── upsert_debt ───────────────────────────────────────────────────────────────

export const UpsertDebtTool = Tool.define("upsert_debt", {
  description:
    "Create or update a loan, mortgage, or other fixed debt. " +
    "Do NOT use this for credit cards — credit cards are accounts (use upsert_account with type 'credit_card'). " +
    "Use this for: personal loans, car loans, mortgages, installment plans (meses sin intereses), or any debt with fixed payments.",

  parameters: z.object({
    name: z.string().describe("Debt name, e.g. 'Crédito auto BBVA', 'Hipoteca Infonavit', 'Tele Liverpool 12 MSI'"),
    type: z.enum(["loan", "mortgage", "other"]).describe("Debt type. Use 'loan' for personal loans, car loans, or installment plans (meses)."),
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
    const parts = [`Debt "${name}" saved. Balance: ${fmt(debt.balance, debt.currency)}`]
    if (debt.interest_rate) parts.push(`${debt.interest_rate}% APR`)
    if (debt.due_day) parts.push(`due day ${debt.due_day}`)
    return {
      title: `Debt: ${name}`,
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
    category: z.string().describe(`Spending category. Use one of: ${EXPENSE_CATEGORIES.join(", ")}.`),
    amount: z.number().describe("Budget limit for this category"),
    period: z.enum(["monthly", "weekly"]).optional().describe("Budget period, default monthly"),
    currency: z.string().optional().describe("Currency code, default MXN"),
    notes: z.string().optional(),
  }),

  async execute({ category, amount, period, currency, notes }) {
    const budget = Profile.upsertBudget({ category: normalizeCategory(category), amount, period, currency, notes })
    return {
      title: `Budget: ${category}`,
      output: `Budget "${category}" saved: ${fmt(budget.amount, budget.currency)} / ${budget.period === "monthly" ? "month" : "week"}`,
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
      ? ` · target: ${new Date(goal.target_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
      : ""
    return {
      title: `Goal: ${name}`,
      output: `Goal "${name}" saved. Progress: ${fmt(goal.current_amount, goal.currency)} / ${fmt(goal.target_amount, goal.currency)} (${pct}%)${datePart}`,
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
        `Expense categories: ${EXPENSE_CATEGORIES.join(", ")}. Income categories: ${INCOME_CATEGORIES.join(", ")}. Use the closest match — it will be normalized automatically.`,
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
    const normalizedCategory = normalizeCategory(category)

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
      category: normalizedCategory,
      description,
      date: dateTs,
      account_id,
      currency,
    })

    const dateStr = new Date(tx.date).toLocaleDateString("en-US", { day: "2-digit", month: "short" })
    const direction = type === "expense" ? "Expense" : "Income"

    const parts = [
      `${direction} logged: ${fmt(tx.amount, tx.currency)} in ${category} — "${description}" (${dateStr})`,
    ]
    if (resolvedAccountName && newAccountBalance !== undefined) {
      parts.push(`New balance for "${resolvedAccountName}": ${fmt(newAccountBalance, tx.currency)}`)
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
        title: "Expense analysis",
        output: `No ${effectiveType === "expense" ? "expenses" : "income"} recorded for ${period}.`,
      }
    }

    const total = results.reduce((s, r) => s + r.total, 0)
    const currency = results[0]?.currency ?? "MXN"

    const periodLabel: Record<string, string> = {
      this_month: "this month",
      last_month: "last month",
      last_30_days: "last 30 days",
      this_year: "this year",
    }

    const lines = [
      `${effectiveType === "expense" ? "Expenses" : "Income"} — ${periodLabel[period]}`,
      "",
    ]

    for (const r of results) {
      const share = Math.round((r.total / total) * 100)
      lines.push(`  ${r.category}: ${fmt(r.total, r.currency)} (${share}%, ${r.count} transactions)`)
    }

    lines.push("", `  Total: ${fmt(total, currency)}`)

    return {
      title: `Analysis: ${periodLabel[period]}`,
      output: lines.join("\n"),
    }
  },
})

// ── list_accounts ─────────────────────────────────────────────────────────────

export const ListAccountsTool = Tool.define("list_accounts", {
  description:
    "List all accounts — bank accounts, savings, investments, AND credit cards. " +
    "Use this when the user asks about their accounts, balances, credit cards, or total assets.",

  parameters: z.object({}),

  async execute() {
    const accounts = Profile.listAccounts()
    if (!accounts.length) {
      return { title: "Accounts", output: "No accounts registered." }
    }
    const regular = accounts.filter((a) => a.type !== "credit_card")
    const cards = accounts.filter((a) => a.type === "credit_card")
    const lines: string[] = []

    if (regular.length) {
      const totalAssets = regular.reduce((s, a) => s + a.balance, 0)
      for (const a of regular) {
        const label = a.institution ? `${a.name} (${a.institution})` : a.name
        lines.push(`  ${label} [${a.type}]: ${fmt(a.balance, a.currency)}`)
      }
      if (regular.length > 1) lines.push(`  ─────\n  Total assets: ${fmt(totalAssets)}`)
    }

    if (cards.length) {
      if (lines.length) lines.push("")
      lines.push("  Credit cards:")
      const totalOwed = cards.reduce((s, a) => s + Math.abs(a.balance), 0)
      for (const a of cards) {
        const label = a.institution ? `${a.name} (${a.institution})` : a.name
        const owed = Math.abs(a.balance)
        const limitPart = a.credit_limit ? ` / limit ${fmt(a.credit_limit, a.currency)}` : ""
        const availPart = a.credit_limit ? ` · available ${fmt(a.credit_limit - owed, a.currency)}` : ""
        lines.push(`  ${label}: ${fmt(owed, a.currency)} owed${limitPart}${availPart}`)
      }
      if (cards.length > 1) lines.push(`  ─────\n  Total owed on cards: ${fmt(totalOwed)}`)
    }

    return { title: "Accounts", output: lines.join("\n") }
  },
})

// ── list_debts ────────────────────────────────────────────────────────────────

export const ListDebtsTool = Tool.define("list_debts", {
  description:
    "List all debts (credit cards, loans, mortgages) with balances and interest rates. " +
    "Use this when the user asks about their debts, liabilities, or payments due.",

  parameters: z.object({}),

  async execute() {
    const debts = Profile.listDebts()
    if (!debts.length) {
      return { title: "Debts", output: "No debts registered." }
    }
    const total = debts.reduce((s, d) => s + d.balance, 0)
    const lines = debts.map((d) => {
      const parts = [`  ${d.name} [${d.type}]: ${fmt(d.balance, d.currency)}`]
      if (d.interest_rate) parts.push(`${d.interest_rate}% APR`)
      if (d.min_payment) parts.push(`min ${fmt(d.min_payment, d.currency)}`)
      if (d.due_day) parts.push(`due day ${d.due_day}`)
      return parts.join(" · ")
    })
    if (debts.length > 1) lines.push(`  ─────\n  Total debt: ${fmt(total)}`)
    return { title: "Debts", output: lines.join("\n") }
  },
})

// ── list_budgets ──────────────────────────────────────────────────────────────

export const ListBudgetsTool = Tool.define("list_budgets", {
  description:
    "List all spending budgets with current month usage. " +
    "Use this when the user asks about their budgets or spending limits.",

  parameters: z.object({}),

  async execute() {
    const budgets = Profile.listBudgets()
    if (!budgets.length) {
      return { title: "Budgets", output: "No budgets registered." }
    }
    const spent = Profile.currentMonthExpensesByCategory()
    const lines = budgets.map((b) => {
      const used = spent.get(b.category.toLowerCase()) ?? 0
      const pct = b.amount === 0 ? 0 : Math.round((used / b.amount) * 100)
      const status = pct >= 100 ? "🔴" : pct >= 80 ? "⚠️ " : "✅"
      const period = b.period === "monthly" ? "month" : "week"
      return `  ${status} ${b.category}: ${fmt(used, b.currency)} / ${fmt(b.amount, b.currency)} (${pct}%) · ${period}`
    })
    return { title: "Budgets", output: lines.join("\n") }
  },
})

// ── list_goals ────────────────────────────────────────────────────────────────

export const ListGoalsTool = Tool.define("list_goals", {
  description:
    "List all financial goals with current progress. " +
    "Use this when the user asks about their savings goals or financial targets.",

  parameters: z.object({}),

  async execute() {
    const goals = Profile.listGoals()
    if (!goals.length) {
      return { title: "Goals", output: "No goals registered." }
    }
    const lines = goals.map((g) => {
      const pct = g.target_amount === 0 ? 100 : Math.round((g.current_amount / g.target_amount) * 100)
      const emoji = pct >= 100 ? "✅" : "🎯"
      const datePart = g.target_date
        ? ` · target: ${new Date(g.target_date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
        : ""
      return `  ${emoji} ${g.name}: ${fmt(g.current_amount, g.currency)} / ${fmt(g.target_amount, g.currency)} (${pct}%)${datePart}`
    })
    return { title: "Goals", output: lines.join("\n") }
  },
})

// ── list_transactions ─────────────────────────────────────────────────────────

export const ListTransactionsTool = Tool.define("list_transactions", {
  description:
    "List individual transactions with optional filters. " +
    "Use this when the user wants to review, search, or audit specific transactions. " +
    "For totals and breakdowns by category, use analyze_expenses instead.",

  parameters: z.object({
    period: z
      .enum(["this_month", "last_month", "last_30_days", "this_year"])
      .optional()
      .describe("Time period to filter. Defaults to this month if omitted."),
    type: z.enum(["income", "expense"]).optional().describe("Filter by income or expense"),
    category: z.string().optional().describe("Filter by category name (case-insensitive)"),
    account_name: z.string().optional().describe("Filter by account name"),
    limit: z.number().int().min(1).max(100).optional().describe("Max results to return, default 20"),
  }),

  async execute({ period, type, category, account_name, limit }) {
    const accounts = Profile.listAccounts()
    const accountById = new Map(accounts.map((a) => [a.id, a.name]))

    let account_id: string | undefined
    if (account_name) {
      const found = accounts.find((a) => a.name.toLowerCase() === account_name.toLowerCase())
      account_id = found?.id
    }

    const txs = Profile.listTransactions({
      period: period ?? "this_month",
      type,
      category,
      account_id,
      limit: limit ?? 20,
    })

    if (!txs.length) {
      return { title: "Transactions", output: "No transactions found with those filters." }
    }

    const lines = txs.map((tx) => {
      const dateStr = new Date(tx.date).toLocaleDateString("en-US", { day: "2-digit", month: "short" })
      const dir = tx.type === "expense" ? "↓" : "↑"
      const accountSuffix = tx.account_id ? ` [${accountById.get(tx.account_id) ?? tx.account_id}]` : ""
      return `  ${tx.id} | ${dateStr} ${dir} ${fmt(tx.amount, tx.currency)} · ${tx.category} — ${tx.description}${accountSuffix}`
    })

    return { title: `Transactions (${txs.length})`, output: lines.join("\n") }
  },
})

// ── pay_debt ──────────────────────────────────────────────────────────────────

export const PayDebtTool = Tool.define("pay_debt", {
  description:
    "Register a payment toward a debt, reducing its outstanding balance. " +
    "Use this when the user says they paid, abonaron, or made a payment on a debt. " +
    "Do NOT use upsert_debt for payments — this tool handles the math automatically. " +
    "If the payment covers the full balance, the debt is marked as fully paid.",

  parameters: z.object({
    name: z.string().describe("Exact debt name, e.g. 'Tarjeta Banamex'"),
    amount: z.number().positive().describe("Amount paid (positive number)"),
    account_name: z
      .string()
      .optional()
      .describe("Account to debit this payment from. Ask the user if they have multiple accounts."),
  }),

  async execute({ name, amount, account_name }) {
    let account_id: string | undefined
    let resolvedAccountName: string | undefined

    const accounts = Profile.listAccounts()
    if (account_name) {
      const found = accounts.find((a) => a.name.toLowerCase() === account_name.toLowerCase())
      if (found) { account_id = found.id; resolvedAccountName = found.name }
    } else if (accounts.length === 1 && accounts[0]) {
      account_id = accounts[0].id
      resolvedAccountName = accounts[0].name
    }

    // Pay debt
    const result = Profile.payDebt(name, amount)
    if (!result) {
      return { title: "Debt not found", output: `No debt found with the name "${name}".` }
    }

    // Debit account if resolved — log as a transaction so balance updates and history is kept
    let accountNote = ""
    if (account_id && resolvedAccountName) {
      const { newAccountBalance } = Profile.logTransaction({
        amount: result.paid,
        type: "expense",
        category: "Debt Payment",
        description: `Payment to ${name}`,
        account_id,
        currency: result.debt.currency,
      })
      if (newAccountBalance !== undefined) {
        accountNote = `\nNew balance for "${resolvedAccountName}": ${fmt(newAccountBalance, result.debt.currency)}`
      }
    }

    const { debt, paid, fullyPaid } = result
    const lines = [
      `Payment of ${fmt(paid, debt.currency)} applied to "${name}".`,
      fullyPaid
        ? `🎉 Debt fully paid off! Balance: $0.00`
        : `Remaining balance: ${fmt(debt.balance, debt.currency)}`,
    ]
    if (accountNote) lines.push(accountNote)

    return { title: `Payment: ${name}`, output: lines.join("\n") }
  },
})

// ── contribute_to_goal ────────────────────────────────────────────────────────

export const ContributeToGoalTool = Tool.define("contribute_to_goal", {
  description:
    "Add a contribution to a financial goal, updating its current amount. " +
    "Use this when the user saves money toward a goal or makes a deposit into a goal fund. " +
    "Do NOT use upsert_goal for contributions — this tool adds to the existing amount automatically. " +
    "Optionally deducts from a linked account.",

  parameters: z.object({
    name: z.string().describe("Exact goal name, e.g. 'Fondo de emergencia'"),
    amount: z.number().positive().describe("Amount to contribute (positive number)"),
    account_name: z
      .string()
      .optional()
      .describe("Account to debit this contribution from. Ask the user if they have multiple accounts."),
  }),

  async execute({ name, amount, account_name }) {
    let account_id: string | undefined
    let resolvedAccountName: string | undefined

    const accounts = Profile.listAccounts()
    if (account_name) {
      const found = accounts.find((a) => a.name.toLowerCase() === account_name.toLowerCase())
      if (found) { account_id = found.id; resolvedAccountName = found.name }
    } else if (accounts.length === 1 && accounts[0]) {
      account_id = accounts[0].id
      resolvedAccountName = accounts[0].name
    }

    const result = Profile.contributeToGoal(name, amount, account_id)
    if (!result) {
      return { title: "Goal not found", output: `No goal found with the name "${name}".` }
    }

    const { goal, newAccountBalance } = result
    const pct = Math.round((goal.current_amount / goal.target_amount) * 100)
    const reached = goal.current_amount >= goal.target_amount

    const lines = [
      `Contribution of ${fmt(amount)} recorded for "${name}".`,
      reached
        ? `🎉 Goal reached! ${fmt(goal.current_amount, goal.currency)} / ${fmt(goal.target_amount, goal.currency)}`
        : `Progress: ${fmt(goal.current_amount, goal.currency)} / ${fmt(goal.target_amount, goal.currency)} (${pct}%)`,
    ]
    if (resolvedAccountName && newAccountBalance !== undefined) {
      lines.push(`New balance for "${resolvedAccountName}": ${fmt(newAccountBalance)}`)
    }

    return { title: `Contribution: ${name}`, output: lines.join("\n") }
  },
})

// ── transfer_between_accounts ─────────────────────────────────────────────────

export const TransferBetweenAccountsTool = Tool.define("transfer_between_accounts", {
  description:
    "Transfer money from one account to another. " +
    "Use this when the user moves money between their own accounts (e.g. nómina → ahorro, ahorro → inversión). " +
    "Both account balances are updated atomically and two transaction records are created for the audit trail.",

  parameters: z.object({
    from_account: z.string().describe("Source account name to debit"),
    to_account: z.string().describe("Destination account name to credit"),
    amount: z.number().positive().describe("Amount to transfer (positive number)"),
    description: z.string().optional().describe("Optional note for this transfer"),
  }),

  async execute({ from_account, to_account, amount, description }) {
    if (from_account.toLowerCase() === to_account.toLowerCase()) {
      return { title: "Invalid transfer", output: "Source and destination accounts cannot be the same." }
    }

    const result = Profile.transferBetweenAccounts(from_account, to_account, amount, description)

    if (!result) {
      const accounts = Profile.listAccounts()
      const names = accounts.map((a) => `"${a.name}"`).join(", ")
      const missing = [from_account, to_account].find(
        (n) => !accounts.some((a) => a.name.toLowerCase() === n.toLowerCase()),
      )
      return {
        title: "Account not found",
        output: `Account "${missing}" not found. Available accounts: ${names || "none"}.`,
      }
    }

    const { fromBalance, toBalance } = result
    return {
      title: `Transfer: ${from_account} → ${to_account}`,
      output: [
        `Transfer of ${fmt(amount)} completed.`,
        `  "${from_account}": new balance ${fmt(fromBalance)}`,
        `  "${to_account}": new balance ${fmt(toBalance)}`,
      ].join("\n"),
    }
  },
})

// ── delete_account ────────────────────────────────────────────────────────────

export const DeleteAccountTool = Tool.define("delete_account", {
  description:
    "Permanently delete a bank/savings/investment account by name. " +
    "Use this when the user explicitly asks to remove or delete an account. " +
    "Always confirm the name with the user before deleting.",

  parameters: z.object({
    name: z.string().describe("Exact account name to delete"),
  }),

  async execute({ name }) {
    const deleted = Profile.deleteAccount(name)
    if (!deleted) {
      return { title: `Account not found`, output: `No account found with the name "${name}".` }
    }
    return { title: `Account deleted`, output: `Account "${name}" permanently deleted.` }
  },
})

// ── delete_debt ───────────────────────────────────────────────────────────────

export const DeleteDebtTool = Tool.define("delete_debt", {
  description:
    "Permanently delete a debt by name. " +
    "Use this when the user explicitly asks to remove a debt (e.g. it was paid off or entered by mistake). " +
    "Always confirm the name with the user before deleting.",

  parameters: z.object({
    name: z.string().describe("Exact debt name to delete"),
  }),

  async execute({ name }) {
    const deleted = Profile.deleteDebt(name)
    if (!deleted) {
      return { title: `Debt not found`, output: `No debt found with the name "${name}".` }
    }
    return { title: `Debt deleted`, output: `Debt "${name}" permanently deleted.` }
  },
})

// ── delete_budget ─────────────────────────────────────────────────────────────

export const DeleteBudgetTool = Tool.define("delete_budget", {
  description:
    "Permanently delete a spending budget by category name. " +
    "Use this when the user asks to remove a budget category entirely.",

  parameters: z.object({
    category: z.string().describe("Budget category to delete, e.g. 'Comida', 'Transporte'"),
  }),

  async execute({ category }) {
    const deleted = Profile.deleteBudget(category)
    if (!deleted) {
      return { title: `Budget not found`, output: `No budget found for category "${category}".` }
    }
    return { title: `Budget deleted`, output: `Budget for "${category}" permanently deleted.` }
  },
})

// ── delete_goal ───────────────────────────────────────────────────────────────

export const DeleteGoalTool = Tool.define("delete_goal", {
  description:
    "Permanently delete a financial goal by name. " +
    "Use this when the user asks to remove a goal (e.g. it was achieved and no longer needed, or entered by mistake).",

  parameters: z.object({
    name: z.string().describe("Exact goal name to delete"),
  }),

  async execute({ name }) {
    const deleted = Profile.deleteGoal(name)
    if (!deleted) {
      return { title: `Goal not found`, output: `No goal found with the name "${name}".` }
    }
    return { title: `Goal deleted`, output: `Goal "${name}" permanently deleted.` }
  },
})

// ── get_net_worth ─────────────────────────────────────────────────────────────

export const GetNetWorthTool = Tool.define("get_net_worth", {
  description:
    "Get the current net worth (assets minus debts) and recent historical trend. " +
    "Use this when the user asks about their net worth, financial health summary, or wealth progress over time.",

  parameters: z.object({
    history_days: z
      .number()
      .int()
      .min(1)
      .max(90)
      .optional()
      .describe("How many days of history to include in the trend. Default 30."),
  }),

  async execute({ history_days }) {
    const snapshot = Profile.takeNetWorthSnapshot()
    const history = Profile.getNetWorthHistory(history_days ?? 30)

    const lines = [
      `Current net worth: ${fmt(snapshot.net_worth, snapshot.currency)}`,
      `  Total assets: ${fmt(snapshot.assets, snapshot.currency)}`,
      `  Total debts:  ${fmt(snapshot.debts, snapshot.currency)}`,
    ]

    if (history.length >= 2) {
      const oldest = history[history.length - 1]!
      const delta = snapshot.net_worth - oldest.net_worth
      const sign = delta >= 0 ? "+" : ""
      const dateStr = new Date(oldest.date).toLocaleDateString("en-US", { day: "2-digit", month: "short" })
      lines.push(``, `Change vs ${dateStr}: ${sign}${fmt(delta, snapshot.currency)}`)

      // Show last 5 snapshots as a mini trend
      const recent = history.slice(0, 5).reverse()
      lines.push(``, `Recent trend:`)
      for (const s of recent) {
        const d = new Date(s.date).toLocaleDateString("en-US", { day: "2-digit", month: "short" })
        lines.push(`  ${d}: ${fmt(s.net_worth, s.currency)}`)
      }
    }

    return { title: "Net worth", output: lines.join("\n") }
  },
})

// ── check_alerts ──────────────────────────────────────────────────────────────

export const CheckAlertsTool = Tool.define("check_alerts", {
  description:
    "Check for financial alerts: overbudget categories, unusual spending, debt payments due soon, and goals at risk. " +
    "Call this proactively at the start of a session or when the user asks about their financial health.",

  parameters: z.object({}),

  async execute() {
    const alerts = Profile.getAlerts()

    if (!alerts.length) {
      return {
        title: "Financial alerts",
        output: "No alerts. Everything looks good.",
      }
    }

    const critical = alerts.filter((a) => a.severity === "critical")
    const warnings = alerts.filter((a) => a.severity === "warning")

    const lines: string[] = []

    if (critical.length) {
      lines.push("🔴 CRITICAL")
      for (const a of critical) lines.push(`  • ${a.message}`)
    }

    if (warnings.length) {
      if (lines.length) lines.push("")
      lines.push("⚠️  WARNINGS")
      for (const a of warnings) lines.push(`  • ${a.message}`)
    }

    return { title: `Alerts (${alerts.length})`, output: lines.join("\n") }
  },
})

// ── create_recurring ──────────────────────────────────────────────────────────

export const CreateRecurringTool = Tool.define("create_recurring", {
  description:
    "Create a recurring income or expense that will be automatically logged on its schedule. " +
    "Use for subscriptions (Netflix, Spotify), rent, salary, loan payments, or any regular transaction. " +
    "The transaction will be logged automatically every time the server starts if it is due.",

  parameters: z.object({
    title: z.string().describe("Name of the recurring transaction, e.g. 'Netflix', 'Renta', 'Nómina'"),
    amount: z.number().positive().describe("Amount per occurrence (always positive)"),
    type: z.enum(["income", "expense"]).describe("Whether this is income or an expense"),
    category: z
      .string()
      .describe(`Expense categories: ${EXPENSE_CATEGORIES.join(", ")}. Income categories: ${INCOME_CATEGORIES.join(", ")}.`),
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).describe("How often this recurs"),
    interval: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Every N units of frequency. Default 1. Use 2 for biweekly (weekly + interval 2)."),
    start_date: z
      .string()
      .optional()
      .describe("First due date in ISO format (YYYY-MM-DD). Defaults to today."),
    account_name: z.string().optional().describe("Account to debit/credit each time it fires"),
    currency: z.string().optional().describe("Currency code, default MXN"),
    notes: z.string().optional(),
  }),

  async execute({ title, amount, type, category, frequency, interval, start_date, account_name, currency, notes }) {
    let account_id: string | undefined
    if (account_name) {
      const accounts = Profile.listAccounts()
      const found = accounts.find((a) => a.name.toLowerCase() === account_name.toLowerCase())
      if (found) account_id = found.id
    }

    const start_ts = start_date ? new Date(start_date).getTime() : undefined
    const rec = Profile.createRecurring({
      title,
      amount,
      type,
      category: normalizeCategory(category),
      account_id,
      currency,
      frequency,
      interval,
      start_date: start_ts,
      notes,
    })

    const nextStr = new Date(rec.next_due).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
    const freqLabel: Record<string, string> = { daily: "daily", weekly: "weekly", monthly: "monthly", yearly: "yearly" }
    const intervalLabel = rec.interval > 1 ? ` every ${rec.interval}` : ""

    return {
      title: `Recurring: ${title}`,
      output: `Recurring "${title}" created: ${fmt(amount, rec.currency)} / ${freqLabel[frequency]}${intervalLabel} — next: ${nextStr}`,
    }
  },
})

// ── list_recurring ────────────────────────────────────────────────────────────

export const ListRecurringTool = Tool.define("list_recurring", {
  description:
    "List all recurring transactions (subscriptions, salary, rent, etc.) with their next due dates. " +
    "Use when the user asks about their subscriptions, fixed expenses, or recurring income.",

  parameters: z.object({}),

  async execute() {
    const recs = Profile.listRecurring()
    if (!recs.length) {
      return { title: "Recurring", output: "No recurring transactions configured." }
    }

    const active = recs.filter((r) => r.active)
    const paused = recs.filter((r) => !r.active)

    const formatRec = (r: (typeof recs)[number]) => {
      const nextStr = new Date(r.next_due).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
      const dir = r.type === "expense" ? "↓" : "↑"
      const freqLabel: Record<string, string> = { daily: "daily", weekly: "weekly", monthly: "monthly", yearly: "yearly" }
      const intervalPart = r.interval > 1 ? ` ×${r.interval}` : ""
      return `  ${dir} ${r.title}: ${fmt(r.amount, r.currency)} · ${freqLabel[r.frequency]}${intervalPart} · next ${nextStr}`
    }

    const lines: string[] = []
    if (active.length) {
      lines.push("Active:")
      lines.push(...active.map(formatRec))
    }
    if (paused.length) {
      if (lines.length) lines.push("")
      lines.push("Paused:")
      lines.push(...paused.map(formatRec))
    }

    return { title: `Recurring (${recs.length})`, output: lines.join("\n") }
  },
})

// ── pause_recurring ───────────────────────────────────────────────────────────

export const PauseRecurringTool = Tool.define("pause_recurring", {
  description:
    "Pause or resume a recurring transaction by name. " +
    "A paused recurring will not be auto-logged until resumed. " +
    "Use when the user cancels a subscription, goes on vacation, or wants to temporarily stop a recurring.",

  parameters: z.object({
    title: z.string().describe("Title of the recurring transaction to pause or resume"),
    active: z.boolean().describe("true to resume, false to pause"),
  }),

  async execute({ title, active }) {
    const recs = Profile.listRecurring()
    const found = recs.find((r) => r.title.toLowerCase() === title.toLowerCase())
    if (!found) {
      return { title: "Not found", output: `No recurring transaction found with the name "${title}".` }
    }
    Profile.setRecurringActive(found.id, active)
    return {
      title: `Recurring: ${title}`,
      output: active ? `"${title}" resumed.` : `"${title}" paused — will not auto-log until resumed.`,
    }
  },
})

// ── delete_recurring ──────────────────────────────────────────────────────────

export const DeleteRecurringTool = Tool.define("delete_recurring", {
  description:
    "Permanently delete a recurring transaction by name. " +
    "Use when the user cancels a subscription permanently or no longer wants to track a recurring.",

  parameters: z.object({
    title: z.string().describe("Title of the recurring transaction to delete"),
  }),

  async execute({ title }) {
    const recs = Profile.listRecurring()
    const found = recs.find((r) => r.title.toLowerCase() === title.toLowerCase())
    if (!found) {
      return { title: "Not found", output: `No recurring transaction found with the name "${title}".` }
    }
    Profile.deleteRecurring(found.id)
    return { title: `Recurring deleted`, output: `"${title}" permanently deleted.` }
  },
})

// ── delete_transaction ────────────────────────────────────────────────────────

export const DeleteTransactionTool = Tool.define("delete_transaction", {
  description:
    "Permanently delete a transaction by its ID. " +
    "If the transaction was linked to an account, the account balance is automatically reverted. " +
    "Use list_transactions first to find the transaction ID.",

  parameters: z.object({
    id: z.string().describe("Transaction ID to delete"),
  }),

  async execute({ id }) {
    const result = Profile.deleteTransaction(id)
    if (!result.found) {
      return { title: "Not found", output: `No transaction found with ID "${id}".` }
    }

    const balanceLine =
      result.revertedAccountBalance !== undefined
        ? `\nAccount balance reverted to ${fmt(result.revertedAccountBalance, "MXN")}.`
        : ""

    return { title: "Transaction deleted", output: `Transaction "${id}" deleted.${balanceLine}` }
  },
})

export const ProfileTools = [
  UpsertAccountTool,
  UpsertDebtTool,
  UpsertBudgetTool,
  UpsertGoalTool,
  LogTransactionTool,
  AnalyzeExpensesTool,
  ListAccountsTool,
  ListDebtsTool,
  ListBudgetsTool,
  ListGoalsTool,
  ListTransactionsTool,
  DeleteTransactionTool,
  PayDebtTool,
  ContributeToGoalTool,
  TransferBetweenAccountsTool,
  DeleteAccountTool,
  DeleteDebtTool,
  DeleteBudgetTool,
  DeleteGoalTool,
  GetNetWorthTool,
  CheckAlertsTool,
  CreateRecurringTool,
  ListRecurringTool,
  PauseRecurringTool,
  DeleteRecurringTool,
]
