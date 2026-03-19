import { sql, eq, and, gte, lte, desc } from "drizzle-orm"
import { Database } from "../storage/db"
import { AccountTable, DebtTable, BudgetTable, GoalTable, TransactionTable } from "./profile.sql"

// ── Types ─────────────────────────────────────────────────────────────────────

export type AccountType = "checking" | "savings" | "investment" | "cash" | "other"
export type DebtType = "credit_card" | "loan" | "mortgage" | "other"
export type TransactionType = "income" | "expense"
export type BudgetPeriod = "monthly" | "weekly"

export interface Account {
  id: string
  name: string
  type: AccountType
  balance: number
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
            currency: opts.currency ?? existing.currency,
            institution: opts.institution ?? existing.institution,
            notes: opts.notes ?? existing.notes,
            time_updated: now,
          })
          .where(eq(AccountTable.id, existing.id))
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
      currency: opts.currency ?? "MXN",
      institution: opts.institution ?? null,
      notes: opts.notes ?? null,
      time_created: now,
      time_updated: now,
    }
    Database.use((db) => db.insert(AccountTable).values(row).run())
    return toAccount(row)
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

  // ── Row mappers ────────────────────────────────────────────────────────────

  function toAccount(r: typeof AccountTable.$inferSelect): Account {
    return {
      id: r.id,
      name: r.name,
      type: r.type as AccountType,
      balance: r.balance,
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
}
