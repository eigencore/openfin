import { sql, eq, and, gt, gte, lte, desc } from "drizzle-orm"
import { Database } from "../storage/db"
import { AccountTable, DebtTable, BudgetTable, GoalTable, TransactionTable, NetWorthSnapshotTable, RecurringTransactionTable, PortfolioPositionTable, IncomeProfileTable } from "./profile.sql"

// ── Types ─────────────────────────────────────────────────────────────────────

export type AccountType = "checking" | "savings" | "investment" | "cash" | "credit_card" | "other"
export type DebtType = "credit_card" | "loan" | "mortgage" | "other"
export type TransactionType = "income" | "expense"
export type BudgetPeriod = "monthly" | "weekly"

export interface Account {
  id: string
  name: string
  type: AccountType
  balance: number          // negative = amount owed (credit cards)
  credit_limit: number | null
  currency: string
  institution: string | null
  notes: string | null
  time: { created: number; updated: number }
}

export interface Debt {
  id: string
  name: string
  type: DebtType
  balance: number
  interest_rate: number | null
  min_payment: number | null
  due_day: number | null
  currency: string
  institution: string | null
  notes: string | null
  time: { created: number; updated: number }
}

export interface Budget {
  id: string
  category: string
  amount: number
  period: BudgetPeriod
  currency: string
  notes: string | null
}

export interface Goal {
  id: string
  name: string
  target_amount: number
  current_amount: number
  target_date: number | null
  currency: string
  notes: string | null
  time_created: number
}

export interface Transaction {
  id: string
  date: number
  amount: number
  type: TransactionType
  category: string
  description: string
  account_id: string | null
  currency: string
}

export type RecurringFrequency = "daily" | "weekly" | "monthly" | "yearly"

export interface RecurringTransaction {
  id: string
  title: string
  amount: number
  type: TransactionType
  category: string
  account_id: string | null
  currency: string
  frequency: RecurringFrequency
  interval: number
  next_due: number
  active: boolean
  notes: string | null
}

export type AssetType = "stock" | "etf" | "crypto" | "other"

export interface PortfolioPosition {
  id: string
  symbol: string
  name: string | null
  quantity: number
  avg_cost: number
  currency: string
  asset_type: AssetType
  notes: string | null
  time: { created: number; updated: number }
}

export interface NetWorthSnapshot {
  id: string
  date: number
  assets: number
  debts: number
  net_worth: number
  currency: string
}

export interface Income {
  amount: number
  currency: string
  notes: string | null
}

export interface ExpenseSummary {
  category: string
  total: number
  count: number
  currency: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findByName<T extends { name: string }>(rows: T[], name: string): T | undefined {
  const lower = name.toLowerCase()
  return rows.find((r) => r.name.toLowerCase() === lower)
}

function periodBounds(period: "this_month" | "last_month" | "last_30_days" | "this_year"): {
  start: number
  end: number
} {
  const now = new Date()
  switch (period) {
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
      return { start, end }
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime()
      return { start, end }
    }
    case "last_30_days": {
      const end = now.getTime()
      const start = end - 30 * 24 * 60 * 60 * 1000
      return { start, end }
    }
    case "this_year": {
      const start = new Date(now.getFullYear(), 0, 1).getTime()
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999).getTime()
      return { start, end }
    }
  }
}

// ── Namespace ─────────────────────────────────────────────────────────────────

export namespace Profile {
  // ── Accounts ──────────────────────────────────────────────────────────────

  export function listAccounts(): Account[] {
    return Database.use((db) =>
      db.select().from(AccountTable).all().map(toAccount),
    )
  }

  export function upsertAccount(opts: {
    name: string
    type: AccountType
    balance: number
    credit_limit?: number
    currency?: string
    institution?: string
    notes?: string
  }): Account {
    const now = Date.now()
    const existing = findByName(listAccounts(), opts.name)

    if (existing) {
      Database.use((db) =>
        db
          .update(AccountTable)
          .set({
            type: opts.type,
            balance: opts.balance,
            credit_limit: opts.credit_limit ?? existing.credit_limit,
            currency: opts.currency ?? existing.currency,
            institution: opts.institution ?? existing.institution,
            notes: opts.notes ?? existing.notes,
            time_updated: now,
          })
          .where(eq(AccountTable.id, existing.id))
          .run(),
      )
      return { ...existing, ...opts, credit_limit: opts.credit_limit ?? existing.credit_limit, currency: opts.currency ?? existing.currency, time: { created: existing.time.created, updated: now } }
    }

    const id = crypto.randomUUID()
    const row = {
      id,
      name: opts.name,
      type: opts.type,
      balance: opts.balance,
      credit_limit: opts.credit_limit ?? null,
      currency: opts.currency ?? "MXN",
      institution: opts.institution ?? null,
      notes: opts.notes ?? null,
      time_created: now,
      time_updated: now,
    }
    Database.use((db) => db.insert(AccountTable).values(row).run())
    return toAccount(row)
  }

  export function transferBetweenAccounts(
    fromName: string,
    toName: string,
    amount: number,
    description?: string,
  ): { fromBalance: number; toBalance: number } | null {
    const accounts = listAccounts()
    const from = findByName(accounts, fromName)
    const to = findByName(accounts, toName)
    if (!from || !to) return null

    const now = Date.now()
    const note = description ?? `Transferencia a ${to.name}`
    const fromBalance = from.balance - amount
    const toBalance = to.balance + amount

    Database.use((db) => {
      // Debit source
      db.update(AccountTable).set({ balance: fromBalance, time_updated: now }).where(eq(AccountTable.id, from.id)).run()
      // Credit destination
      db.update(AccountTable).set({ balance: toBalance, time_updated: now }).where(eq(AccountTable.id, to.id)).run()
      // Log both legs as transactions for full audit trail
      const baseRow = { date: now, amount, currency: from.currency, time_created: now, time_updated: now }
      db.insert(TransactionTable).values({
        ...baseRow, id: crypto.randomUUID(), type: "expense",
        category: "Transferencia", description: note, account_id: from.id,
      }).run()
      db.insert(TransactionTable).values({
        ...baseRow, id: crypto.randomUUID(), type: "income",
        category: "Transferencia", description: `Transferencia de ${from.name}`, account_id: to.id,
      }).run()
    })

    return { fromBalance, toBalance }
  }

  export function deleteAccount(name: string): boolean {
    const existing = findByName(listAccounts(), name)
    if (!existing) return false
    Database.use((db) => db.delete(AccountTable).where(eq(AccountTable.id, existing.id)).run())
    return true
  }

  // ── Debts ──────────────────────────────────────────────────────────────────

  export function listDebts(): Debt[] {
    return Database.use((db) => db.select().from(DebtTable).all().map(toDebt))
  }

  export function upsertDebt(opts: {
    name: string
    type: DebtType
    balance: number
    interest_rate?: number
    min_payment?: number
    due_day?: number
    currency?: string
    institution?: string
    notes?: string
  }): Debt {
    const now = Date.now()
    const existing = findByName(listDebts(), opts.name)

    if (existing) {
      Database.use((db) =>
        db
          .update(DebtTable)
          .set({
            type: opts.type,
            balance: opts.balance,
            interest_rate: opts.interest_rate ?? existing.interest_rate,
            min_payment: opts.min_payment ?? existing.min_payment,
            due_day: opts.due_day ?? existing.due_day,
            currency: opts.currency ?? existing.currency,
            institution: opts.institution ?? existing.institution,
            notes: opts.notes ?? existing.notes,
            time_updated: now,
          })
          .where(eq(DebtTable.id, existing.id))
          .run(),
      )
      return { ...existing, ...opts, currency: opts.currency ?? existing.currency, time: { created: existing.time.created, updated: now } }
    }

    const id = crypto.randomUUID()
    const row = {
      id,
      name: opts.name,
      type: opts.type,
      balance: opts.balance,
      interest_rate: opts.interest_rate ?? null,
      min_payment: opts.min_payment ?? null,
      due_day: opts.due_day ?? null,
      currency: opts.currency ?? "MXN",
      institution: opts.institution ?? null,
      notes: opts.notes ?? null,
      time_created: now,
      time_updated: now,
    }
    Database.use((db) => db.insert(DebtTable).values(row).run())
    return toDebt(row)
  }

  export function payDebt(name: string, amount: number): { debt: Debt; paid: number; fullyPaid: boolean } | null {
    const existing = findByName(listDebts(), name)
    if (!existing) return null
    const paid = Math.min(amount, existing.balance)
    const newBalance = Math.max(0, existing.balance - amount)
    const now = Date.now()
    Database.use((db) =>
      db
        .update(DebtTable)
        .set({ balance: newBalance, time_updated: now })
        .where(eq(DebtTable.id, existing.id))
        .run(),
    )
    return {
      debt: { ...existing, balance: newBalance, time: { created: existing.time.created, updated: now } },
      paid,
      fullyPaid: newBalance === 0,
    }
  }

  export function deleteDebt(name: string): boolean {
    const existing = findByName(listDebts(), name)
    if (!existing) return false
    Database.use((db) => db.delete(DebtTable).where(eq(DebtTable.id, existing.id)).run())
    return true
  }

  // ── Budgets ────────────────────────────────────────────────────────────────

  export function listBudgets(): Budget[] {
    return Database.use((db) => db.select().from(BudgetTable).all().map(toBudget))
  }

  export function upsertBudget(opts: {
    category: string
    amount: number
    period?: BudgetPeriod
    currency?: string
    notes?: string
  }): Budget {
    const now = Date.now()
    const lower = opts.category.toLowerCase()
    const existing = Database.use((db) =>
      db.select().from(BudgetTable).all().find((r) => r.category.toLowerCase() === lower),
    )

    if (existing) {
      Database.use((db) =>
        db
          .update(BudgetTable)
          .set({
            amount: opts.amount,
            period: opts.period ?? existing.period,
            currency: opts.currency ?? existing.currency,
            notes: opts.notes ?? existing.notes,
            time_updated: now,
          })
          .where(eq(BudgetTable.id, existing.id))
          .run(),
      )
      return toBudget({ ...existing, amount: opts.amount, period: opts.period ?? existing.period, currency: opts.currency ?? existing.currency })
    }

    const id = crypto.randomUUID()
    const row = {
      id,
      category: opts.category,
      amount: opts.amount,
      period: opts.period ?? "monthly",
      currency: opts.currency ?? "MXN",
      notes: opts.notes ?? null,
      time_created: now,
      time_updated: now,
    }
    Database.use((db) => db.insert(BudgetTable).values(row).run())
    return toBudget(row)
  }

  export function deleteBudget(category: string): boolean {
    const lower = category.toLowerCase()
    const existing = Database.use((db) =>
      db.select().from(BudgetTable).all().find((r) => r.category.toLowerCase() === lower),
    )
    if (!existing) return false
    Database.use((db) => db.delete(BudgetTable).where(eq(BudgetTable.id, existing.id)).run())
    return true
  }

  // ── Goals ──────────────────────────────────────────────────────────────────

  export function listGoals(): Goal[] {
    return Database.use((db) => db.select().from(GoalTable).all().map(toGoal))
  }

  export function upsertGoal(opts: {
    name: string
    target_amount: number
    current_amount?: number
    target_date?: number
    currency?: string
    notes?: string
  }): Goal {
    const now = Date.now()
    const existing = findByName(listGoals(), opts.name)

    if (existing) {
      Database.use((db) =>
        db
          .update(GoalTable)
          .set({
            target_amount: opts.target_amount,
            current_amount: opts.current_amount ?? existing.current_amount,
            target_date: opts.target_date ?? existing.target_date,
            currency: opts.currency ?? existing.currency,
            notes: opts.notes ?? existing.notes,
            time_updated: now,
          })
          .where(eq(GoalTable.id, existing.id))
          .run(),
      )
      return {
        ...existing,
        target_amount: opts.target_amount,
        current_amount: opts.current_amount ?? existing.current_amount,
        target_date: opts.target_date ?? existing.target_date,
        currency: opts.currency ?? existing.currency,
      }
    }

    const id = crypto.randomUUID()
    const row = {
      id,
      name: opts.name,
      target_amount: opts.target_amount,
      current_amount: opts.current_amount ?? 0,
      target_date: opts.target_date ?? null,
      currency: opts.currency ?? "MXN",
      notes: opts.notes ?? null,
      time_created: now,
      time_updated: now,
    }
    Database.use((db) => db.insert(GoalTable).values(row).run())
    return toGoal(row)
  }

  export function contributeToGoal(
    name: string,
    amount: number,
    accountId?: string,
  ): { goal: Goal; newAccountBalance?: number } | null {
    const existing = findByName(listGoals(), name)
    if (!existing) return null
    const newAmount = existing.current_amount + amount
    const now = Date.now()

    let newAccountBalance: number | undefined

    Database.use((db) => {
      db
        .update(GoalTable)
        .set({ current_amount: newAmount, time_updated: now })
        .where(eq(GoalTable.id, existing.id))
        .run()

      if (accountId) {
        const account = db.select().from(AccountTable).where(eq(AccountTable.id, accountId)).limit(1).get()
        if (account) {
          newAccountBalance = account.balance - amount
          db
            .update(AccountTable)
            .set({ balance: newAccountBalance, time_updated: now })
            .where(eq(AccountTable.id, accountId))
            .run()
        }
      }
    })

    return {
      goal: { ...existing, current_amount: newAmount },
      newAccountBalance,
    }
  }

  export function deleteGoal(name: string): boolean {
    const existing = findByName(listGoals(), name)
    if (!existing) return false
    Database.use((db) => db.delete(GoalTable).where(eq(GoalTable.id, existing.id)).run())
    return true
  }

  // ── Transactions ───────────────────────────────────────────────────────────

  export function logTransaction(opts: {
    amount: number
    type: TransactionType
    category: string
    description: string
    date?: number
    account_id?: string
    currency?: string
  }): { transaction: Transaction; newAccountBalance?: number } {
    const now = Date.now()
    const id = crypto.randomUUID()
    const row = {
      id,
      date: opts.date ?? now,
      amount: opts.amount,
      type: opts.type,
      category: opts.category,
      description: opts.description,
      account_id: opts.account_id ?? null,
      currency: opts.currency ?? "MXN",
      time_created: now,
      time_updated: now,
    }

    let newAccountBalance: number | undefined

    Database.use((db) => {
      db.insert(TransactionTable).values(row).run()

      // Update account balance if linked
      if (opts.account_id) {
        const account = db
          .select()
          .from(AccountTable)
          .where(eq(AccountTable.id, opts.account_id))
          .limit(1)
          .get()

        if (account) {
          const delta = opts.type === "expense" ? -opts.amount : opts.amount
          newAccountBalance = account.balance + delta
          db
            .update(AccountTable)
            .set({ balance: newAccountBalance, time_updated: now })
            .where(eq(AccountTable.id, opts.account_id))
            .run()
        }
      }
    })

    return { transaction: toTransaction(row), newAccountBalance }
  }

  export function deleteTransaction(id: string): { found: boolean; revertedAccountBalance?: number } {
    const now = Date.now()

    return Database.use((db) => {
      const tx = db.select().from(TransactionTable).where(eq(TransactionTable.id, id)).limit(1).get()
      if (!tx) return { found: false }

      db.delete(TransactionTable).where(eq(TransactionTable.id, id)).run()

      let revertedAccountBalance: number | undefined
      if (tx.account_id) {
        const account = db.select().from(AccountTable).where(eq(AccountTable.id, tx.account_id)).limit(1).get()
        if (account) {
          // Reverse the original delta: expense added negative, income added positive
          const delta = tx.type === "expense" ? tx.amount : -tx.amount
          revertedAccountBalance = account.balance + delta
          db
            .update(AccountTable)
            .set({ balance: revertedAccountBalance, time_updated: now })
            .where(eq(AccountTable.id, tx.account_id))
            .run()
        }
      }

      return { found: true, revertedAccountBalance }
    })
  }

  export function listTransactions(opts: {
    period?: "this_month" | "last_month" | "last_30_days" | "this_year"
    type?: TransactionType
    category?: string
    account_id?: string
    limit?: number
  } = {}): Transaction[] {
    const { start, end } = opts.period ? periodBounds(opts.period) : { start: 0, end: Date.now() }

    const rows = Database.use((db) =>
      db
        .select()
        .from(TransactionTable)
        .where(
          and(
            opts.period ? gte(TransactionTable.date, start) : undefined,
            opts.period ? lte(TransactionTable.date, end) : undefined,
            opts.type ? eq(TransactionTable.type, opts.type) : undefined,
            opts.account_id ? eq(TransactionTable.account_id, opts.account_id) : undefined,
          ),
        )
        .orderBy(desc(TransactionTable.date))
        .limit(opts.limit ?? 50)
        .all(),
    )

    const category = opts.category?.toLowerCase()
    const filtered = category ? rows.filter((r) => r.category.toLowerCase() === category) : rows
    return filtered.map(toTransaction)
  }

  export function analyzeExpenses(opts: {
    period: "this_month" | "last_month" | "last_30_days" | "this_year"
    type?: TransactionType
  }): ExpenseSummary[] {
    const { start, end } = periodBounds(opts.period)

    const rows = Database.use((db) =>
      db
        .select()
        .from(TransactionTable)
        .where(
          and(
            gte(TransactionTable.date, start),
            lte(TransactionTable.date, end),
            opts.type ? eq(TransactionTable.type, opts.type) : undefined,
          ),
        )
        .all(),
    )

    // Group by category in JS
    const map = new Map<string, { total: number; count: number; currency: string }>()
    for (const r of rows) {
      const existing = map.get(r.category)
      if (existing) {
        existing.total += r.amount
        existing.count++
      } else {
        map.set(r.category, { total: r.amount, count: 1, currency: r.currency })
      }
    }

    return Array.from(map.entries())
      .map(([category, { total, count, currency }]) => ({ category, total, count, currency }))
      .sort((a, b) => b.total - a.total)
  }

  /** Returns expenses summed per category for the current month — used for context injection */
  export function currentMonthExpensesByCategory(): Map<string, number> {
    const summary = analyzeExpenses({ period: "this_month", type: "expense" })
    return new Map(summary.map((s) => [s.category, s.total]))
  }

  // ── Net worth snapshots ────────────────────────────────────────────────────

  export function takeNetWorthSnapshot(): NetWorthSnapshot {
    const accounts = listAccounts()
    const debts = listDebts()
    const assets = accounts.reduce((s, a) => s + a.balance, 0)
    const totalDebts = debts.reduce((s, d) => s + d.balance, 0)
    const net_worth = assets - totalDebts

    // Day-level granularity — start of today
    const now = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

    const id = crypto.randomUUID()
    const row = {
      id,
      date: dayStart,
      assets,
      debts: totalDebts,
      net_worth,
      currency: "MXN",
      time_created: Date.now(),
      time_updated: Date.now(),
    }

    // Upsert: if a snapshot already exists for today, update it
    const existing = Database.use((db) =>
      db.select().from(NetWorthSnapshotTable).where(eq(NetWorthSnapshotTable.date, dayStart)).limit(1).get(),
    )

    if (existing) {
      Database.use((db) =>
        db
          .update(NetWorthSnapshotTable)
          .set({ assets, debts: totalDebts, net_worth, time_updated: Date.now() })
          .where(eq(NetWorthSnapshotTable.id, existing.id))
          .run(),
      )
      return { ...row, id: existing.id }
    }

    Database.use((db) => db.insert(NetWorthSnapshotTable).values(row).run())
    return row
  }

  export function getNetWorthHistory(limit = 30): NetWorthSnapshot[] {
    return Database.use((db) =>
      db
        .select()
        .from(NetWorthSnapshotTable)
        .orderBy(desc(NetWorthSnapshotTable.date))
        .limit(limit)
        .all()
        .map((r) => ({
          id: r.id,
          date: r.date,
          assets: r.assets,
          debts: r.debts,
          net_worth: r.net_worth,
          currency: r.currency,
        })),
    )
  }

  // ── Alerts ─────────────────────────────────────────────────────────────────

  export interface Alert {
    type: "overbudget" | "near_budget" | "debt_due" | "goal_at_risk" | "unusual_spending"
    severity: "warning" | "critical"
    message: string
  }

  export function getAlerts(): Alert[] {
    const alerts: Alert[] = []
    const now = new Date()
    const today = now.getDate()

    // ── Over-budget / near-budget ──────────────────────────────────────────
    const budgets = listBudgets()
    const spent = currentMonthExpensesByCategory()

    for (const b of budgets) {
      const used = spent.get(b.category.toLowerCase()) ?? 0
      const ratio = used / b.amount
      if (ratio >= 1) {
        alerts.push({
          type: "overbudget",
          severity: "critical",
          message: `Budget for "${b.category}" exceeded: $${used.toFixed(0)} / $${b.amount.toFixed(0)} (${Math.round(ratio * 100)}%)`,
        })
      } else if (ratio >= 0.8) {
        alerts.push({
          type: "near_budget",
          severity: "warning",
          message: `"${b.category}" at ${Math.round(ratio * 100)}% of monthly budget ($${used.toFixed(0)} / $${b.amount.toFixed(0)})`,
        })
      }
    }

    // ── Unusual spending (current month > 150% of 3-month average) ─────────
    const prevSummaries = [
      analyzeExpenses({ period: "last_month", type: "expense" }),
    ]
    const avgByCategory = new Map<string, number>()
    for (const summary of prevSummaries) {
      for (const s of summary) {
        const key = s.category.toLowerCase()
        avgByCategory.set(key, (avgByCategory.get(key) ?? 0) + s.total)
      }
    }
    for (const [cat, total] of spent.entries()) {
      const avg = avgByCategory.get(cat)
      if (avg && avg > 0 && total > avg * 1.5) {
        alerts.push({
          type: "unusual_spending",
          severity: "warning",
          message: `Unusual spending in "${cat}": $${total.toFixed(0)} this month vs $${avg.toFixed(0)} last month (+${Math.round((total / avg - 1) * 100)}%)`,
        })
      }
    }

    // ── Debt due dates (within next 7 days) ────────────────────────────────
    const debts = listDebts()
    for (const d of debts) {
      if (!d.due_day) continue
      const daysUntilDue = d.due_day >= today ? d.due_day - today : 30 - today + d.due_day
      if (daysUntilDue <= 7) {
        alerts.push({
          type: "debt_due",
          severity: daysUntilDue <= 2 ? "critical" : "warning",
          message: `Payment for "${d.name}" due in ${daysUntilDue === 0 ? "today" : `${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`} (day ${d.due_day}). Minimum: $${(d.min_payment ?? 0).toFixed(0)}`,
        })
      }
    }

    // ── Goals at risk (deadline within 60 days, progress < 80%) ───────────
    const goals = listGoals()
    for (const g of goals) {
      if (!g.target_date) continue
      const daysLeft = Math.ceil((g.target_date - now.getTime()) / (1000 * 60 * 60 * 24))
      const progress = g.current_amount / g.target_amount
      if (daysLeft > 0 && daysLeft <= 60 && progress < 0.8) {
        const remaining = g.target_amount - g.current_amount
        alerts.push({
          type: "goal_at_risk",
          severity: daysLeft <= 14 ? "critical" : "warning",
          message: `Goal "${g.name}" at risk: ${Math.round(progress * 100)}% complete, $${remaining.toFixed(0)} remaining in ${daysLeft} days`,
        })
      }
    }

    return alerts.sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1))
  }

  // ── Row mappers ────────────────────────────────────────────────────────────

  function toAccount(r: typeof AccountTable.$inferSelect): Account {
    return {
      id: r.id,
      name: r.name,
      type: r.type as AccountType,
      balance: r.balance,
      credit_limit: r.credit_limit ?? null,
      currency: r.currency,
      institution: r.institution ?? null,
      notes: r.notes ?? null,
      time: { created: r.time_created, updated: r.time_updated },
    }
  }

  function toDebt(r: typeof DebtTable.$inferSelect): Debt {
    return {
      id: r.id,
      name: r.name,
      type: r.type as DebtType,
      balance: r.balance,
      interest_rate: r.interest_rate ?? null,
      min_payment: r.min_payment ?? null,
      due_day: r.due_day ?? null,
      currency: r.currency,
      institution: r.institution ?? null,
      notes: r.notes ?? null,
      time: { created: r.time_created, updated: r.time_updated },
    }
  }

  function toBudget(r: typeof BudgetTable.$inferSelect): Budget {
    return {
      id: r.id,
      category: r.category,
      amount: r.amount,
      period: r.period as BudgetPeriod,
      currency: r.currency,
      notes: r.notes ?? null,
    }
  }

  function toGoal(r: typeof GoalTable.$inferSelect): Goal {
    return {
      id: r.id,
      name: r.name,
      target_amount: r.target_amount,
      current_amount: r.current_amount,
      target_date: r.target_date ?? null,
      currency: r.currency,
      notes: r.notes ?? null,
      time_created: r.time_created,
    }
  }

  function toTransaction(r: typeof TransactionTable.$inferSelect): Transaction {
    return {
      id: r.id,
      date: r.date,
      amount: r.amount,
      type: r.type as TransactionType,
      category: r.category,
      description: r.description,
      account_id: r.account_id ?? null,
      currency: r.currency,
    }
  }

  function toRecurring(r: typeof RecurringTransactionTable.$inferSelect): RecurringTransaction {
    return {
      id: r.id,
      title: r.title,
      amount: r.amount,
      type: r.type as TransactionType,
      category: r.category,
      account_id: r.account_id ?? null,
      currency: r.currency,
      frequency: r.frequency as RecurringFrequency,
      interval: r.interval,
      next_due: r.next_due,
      active: r.active === 1,
      notes: r.notes ?? null,
    }
  }

  // ── Recurring transactions ─────────────────────────────────────────────────

  /** Advance a next_due timestamp by one interval. */
  function advanceNextDue(next_due: number, frequency: RecurringFrequency, interval: number): number {
    const d = new Date(next_due)
    switch (frequency) {
      case "daily":
        d.setDate(d.getDate() + interval)
        break
      case "weekly":
        d.setDate(d.getDate() + interval * 7)
        break
      case "monthly":
        d.setMonth(d.getMonth() + interval)
        break
      case "yearly":
        d.setFullYear(d.getFullYear() + interval)
        break
    }
    return d.getTime()
  }

  export function createRecurring(opts: {
    title: string
    amount: number
    type: TransactionType
    category: string
    account_id?: string
    currency?: string
    frequency: RecurringFrequency
    interval?: number
    start_date?: number // Unix ms — defaults to today
    notes?: string
  }): RecurringTransaction {
    const now = Date.now()
    // Start of today in local time (midnight)
    const startOfDay = (ts: number) => {
      const d = new Date(ts)
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    }
    const id = crypto.randomUUID()
    const interval = opts.interval ?? 1
    const next_due = startOfDay(opts.start_date ?? now)
    const row = {
      id,
      title: opts.title,
      amount: opts.amount,
      type: opts.type,
      category: opts.category,
      account_id: opts.account_id ?? null,
      currency: opts.currency ?? "MXN",
      frequency: opts.frequency,
      interval,
      next_due,
      active: 1,
      notes: opts.notes ?? null,
      time_created: now,
      time_updated: now,
    }
    Database.use((db) => db.insert(RecurringTransactionTable).values(row).run())
    return toRecurring(row)
  }

  export function listRecurring(): RecurringTransaction[] {
    return Database.use((db) =>
      db.select().from(RecurringTransactionTable).all().map(toRecurring),
    )
  }

  export function deleteRecurring(id: string): boolean {
    const existing = Database.use((db) =>
      db.select().from(RecurringTransactionTable).where(eq(RecurringTransactionTable.id, id)).get(),
    )
    if (!existing) return false
    Database.use((db) => db.delete(RecurringTransactionTable).where(eq(RecurringTransactionTable.id, id)).run())
    return true
  }

  export function setRecurringActive(id: string, active: boolean): RecurringTransaction | null {
    const now = Date.now()
    Database.use((db) =>
      db
        .update(RecurringTransactionTable)
        .set({ active: active ? 1 : 0, time_updated: now })
        .where(eq(RecurringTransactionTable.id, id))
        .run(),
    )
    const row = Database.use((db) =>
      db.select().from(RecurringTransactionTable).where(eq(RecurringTransactionTable.id, id)).get(),
    )
    return row ? toRecurring(row) : null
  }

  /**
   * Process all due recurring transactions.
   * Returns the list of transactions that were logged.
   */
  export function processDueRecurring(): RecurringTransaction[] {
    const now = Date.now()
    const due = Database.use((db) =>
      db
        .select()
        .from(RecurringTransactionTable)
        .where(
          and(
            eq(RecurringTransactionTable.active, 1),
            lte(RecurringTransactionTable.next_due, now),
          ),
        )
        .all(),
    )

    const logged: RecurringTransaction[] = []
    for (const row of due) {
      const rec = toRecurring(row)

      // Log transaction (reuse existing logTransaction logic inline to avoid circular)
      const txNow = rec.next_due // use the scheduled date, not today
      Database.use((db) => {
        db.insert(TransactionTable).values({
          id: crypto.randomUUID(),
          date: txNow,
          amount: rec.amount,
          type: rec.type,
          category: rec.category,
          description: rec.title,
          account_id: rec.account_id,
          currency: rec.currency,
          time_created: now,
          time_updated: now,
        }).run()

        // Update linked account balance
        if (rec.account_id) {
          const account = db.select().from(AccountTable).where(eq(AccountTable.id, rec.account_id)).get()
          if (account) {
            const delta = rec.type === "expense" ? -rec.amount : rec.amount
            db.update(AccountTable)
              .set({ balance: account.balance + delta, time_updated: now })
              .where(eq(AccountTable.id, rec.account_id))
              .run()
          }
        }

        // Advance next_due
        const newNextDue = advanceNextDue(rec.next_due, rec.frequency, rec.interval)
        db.update(RecurringTransactionTable)
          .set({ next_due: newNextDue, time_updated: now })
          .where(eq(RecurringTransactionTable.id, rec.id))
          .run()
      })

      logged.push(rec)
    }

    return logged
  }

  /**
   * Returns recurring transactions due within the next `days` days (not yet overdue).
   */
  export function upcomingRecurring(days = 7): RecurringTransaction[] {
    const now = Date.now()
    const limit = now + days * 24 * 60 * 60 * 1000
    return Database.use((db) =>
      db
        .select()
        .from(RecurringTransactionTable)
        .where(
          and(
            eq(RecurringTransactionTable.active, 1),
            gt(RecurringTransactionTable.next_due, now),
            lte(RecurringTransactionTable.next_due, limit),
          ),
        )
        .all()
        .map(toRecurring),
    )
  }

  // ── Portfolio ──────────────────────────────────────────────────────────────

  function toPosition(row: typeof PortfolioPositionTable.$inferSelect): PortfolioPosition {
    return {
      id: row.id,
      symbol: row.symbol,
      name: row.name ?? null,
      quantity: row.quantity,
      avg_cost: row.avg_cost,
      currency: row.currency,
      asset_type: row.asset_type as AssetType,
      notes: row.notes ?? null,
      time: { created: row.time_created, updated: row.time_updated },
    }
  }

  export function addPosition(opts: {
    symbol: string
    name?: string
    quantity: number
    avg_cost: number
    currency?: string
    asset_type?: AssetType
    notes?: string
  }): PortfolioPosition {
    const now = Date.now()
    const symbol = opts.symbol.toUpperCase()

    // If position already exists for this symbol, update it (weighted average cost)
    const existing = Database.use((db) =>
      db.select().from(PortfolioPositionTable).where(eq(PortfolioPositionTable.symbol, symbol)).get(),
    )

    if (existing) {
      const totalQuantity = existing.quantity + opts.quantity
      const newAvgCost =
        (existing.quantity * existing.avg_cost + opts.quantity * opts.avg_cost) / totalQuantity
      Database.use((db) =>
        db
          .update(PortfolioPositionTable)
          .set({
            quantity: totalQuantity,
            avg_cost: newAvgCost,
            name: opts.name ?? existing.name,
            notes: opts.notes ?? existing.notes,
            time_updated: now,
          })
          .where(eq(PortfolioPositionTable.id, existing.id))
          .run(),
      )
      return toPosition({ ...existing, quantity: totalQuantity, avg_cost: newAvgCost, time_updated: now })
    }

    const id = crypto.randomUUID()
    const row = {
      id,
      symbol,
      name: opts.name ?? null,
      quantity: opts.quantity,
      avg_cost: opts.avg_cost,
      currency: opts.currency ?? "USD",
      asset_type: opts.asset_type ?? "stock",
      notes: opts.notes ?? null,
      time_created: now,
      time_updated: now,
    }
    Database.use((db) => db.insert(PortfolioPositionTable).values(row).run())
    return toPosition(row)
  }

  export function listPositions(): PortfolioPosition[] {
    return Database.use((db) =>
      db.select().from(PortfolioPositionTable).all(),
    ).map(toPosition)
  }

  export function updatePosition(
    id: string,
    opts: { quantity?: number; avg_cost?: number; name?: string; notes?: string },
  ): PortfolioPosition | null {
    const now = Date.now()
    const existing = Database.use((db) =>
      db.select().from(PortfolioPositionTable).where(eq(PortfolioPositionTable.id, id)).get(),
    )
    if (!existing) return null
    const updates: Partial<typeof PortfolioPositionTable.$inferInsert> = { time_updated: now }
    if (opts.quantity !== undefined) updates.quantity = opts.quantity
    if (opts.avg_cost !== undefined) updates.avg_cost = opts.avg_cost
    if (opts.name !== undefined) updates.name = opts.name
    if (opts.notes !== undefined) updates.notes = opts.notes
    Database.use((db) =>
      db.update(PortfolioPositionTable).set(updates).where(eq(PortfolioPositionTable.id, id)).run(),
    )
    return toPosition({ ...existing, ...updates })
  }

  export function closePosition(id: string): boolean {
    const existing = Database.use((db) =>
      db.select().from(PortfolioPositionTable).where(eq(PortfolioPositionTable.id, id)).get(),
    )
    if (!existing) return false
    Database.use((db) => db.delete(PortfolioPositionTable).where(eq(PortfolioPositionTable.id, id)).run())
    return true
  }

  // ── Income profile ────────────────────────────────────────────────────────────

  export function setIncome(amount: number, currency = "MXN", notes?: string): Income {
    const now = Date.now()
    const existing = Database.use((db) =>
      db.select().from(IncomeProfileTable).where(eq(IncomeProfileTable.id, "default")).get(),
    )
    if (existing) {
      Database.use((db) =>
        db
          .update(IncomeProfileTable)
          .set({ amount, currency, notes: notes ?? null, time_updated: now })
          .where(eq(IncomeProfileTable.id, "default"))
          .run(),
      )
    } else {
      Database.use((db) =>
        db
          .insert(IncomeProfileTable)
          .values({ id: "default", amount, currency, notes: notes ?? null, time_created: now, time_updated: now })
          .run(),
      )
    }
    return { amount, currency, notes: notes ?? null }
  }

  export function getIncome(): Income | null {
    const row = Database.use((db) =>
      db.select().from(IncomeProfileTable).where(eq(IncomeProfileTable.id, "default")).get(),
    )
    if (!row) return null
    return { amount: row.amount, currency: row.currency, notes: row.notes ?? null }
  }
}
