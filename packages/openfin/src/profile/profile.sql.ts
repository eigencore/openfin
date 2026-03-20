import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const PortfolioPositionTable = sqliteTable("portfolio_position", {
  id: text().primaryKey(),
  symbol: text().notNull(),          // "AAPL", "BTC-USD", "VOO", "AMXL.MX"
  name: text(),                      // "Apple Inc." — optional display name
  quantity: real().notNull(),        // number of shares/units held
  avg_cost: real().notNull(),        // average cost per unit (in currency)
  currency: text().notNull().default("USD"),
  asset_type: text().notNull().default("stock"), // "stock" | "etf" | "crypto" | "other"
  notes: text(),
  ...Timestamps,
})

export const RecurringTransactionTable = sqliteTable("recurring_transaction", {
  id: text().primaryKey(),
  title: text().notNull(),
  amount: real().notNull(),
  type: text().notNull(), // "income" | "expense"
  category: text().notNull(),
  account_id: text(),
  currency: text().notNull().default("MXN"),
  frequency: text().notNull(), // "daily" | "weekly" | "monthly" | "yearly"
  interval: integer().notNull().default(1), // every N units (e.g. 2 = biweekly for weekly)
  next_due: integer().notNull(), // Unix timestamp ms — when to log next
  active: integer().notNull().default(1), // 1 = active, 0 = paused
  notes: text(),
  ...Timestamps,
})

export const AccountTable = sqliteTable("account", {
  id: text().primaryKey(),
  name: text().notNull(),
  type: text().notNull(), // "checking" | "savings" | "investment" | "cash" | "credit_card" | "other"
  balance: real().notNull().default(0), // negative = amount owed (credit cards)
  credit_limit: real(),                 // only for credit_card type
  currency: text().notNull().default("MXN"),
  institution: text(),
  notes: text(),
  ...Timestamps,
})

export const DebtTable = sqliteTable("debt", {
  id: text().primaryKey(),
  name: text().notNull(),
  type: text().notNull(), // "credit_card" | "loan" | "mortgage" | "other"
  balance: real().notNull().default(0),
  interest_rate: real(),
  min_payment: real(),
  due_day: integer(), // day of month (1–31)
  currency: text().notNull().default("MXN"),
  institution: text(),
  notes: text(),
  ...Timestamps,
})

export const BudgetTable = sqliteTable("budget", {
  id: text().primaryKey(),
  category: text().notNull(),
  amount: real().notNull(),
  period: text().notNull().default("monthly"), // "monthly" | "weekly"
  currency: text().notNull().default("MXN"),
  notes: text(),
  ...Timestamps,
})

export const GoalTable = sqliteTable("goal", {
  id: text().primaryKey(),
  name: text().notNull(),
  target_amount: real().notNull(),
  current_amount: real().notNull().default(0),
  target_date: integer(), // Unix timestamp ms
  currency: text().notNull().default("MXN"),
  notes: text(),
  ...Timestamps,
})

export const NetWorthSnapshotTable = sqliteTable(
  "net_worth_snapshot",
  {
    id: text().primaryKey(),
    date: integer().notNull(), // Unix timestamp ms — day-level granularity (start of day)
    assets: real().notNull(),
    debts: real().notNull(),
    net_worth: real().notNull(),
    currency: text().notNull().default("MXN"),
    ...Timestamps,
  },
  (table) => [index("net_worth_snapshot_date_idx").on(table.date)],
)

export const TransactionTable = sqliteTable(
  "transaction",
  {
    id: text().primaryKey(),
    date: integer().notNull(), // Unix timestamp ms
    amount: real().notNull(), // always positive; type determines direction
    type: text().notNull(), // "income" | "expense"
    category: text().notNull(),
    description: text().notNull(),
    account_id: text(), // optional FK — no cascade, kept as soft reference
    currency: text().notNull().default("MXN"),
    ...Timestamps,
  },
  (table) => [
    index("transaction_date_idx").on(table.date),
    index("transaction_category_idx").on(table.category),
  ],
)
