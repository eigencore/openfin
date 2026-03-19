import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

export const AccountTable = sqliteTable("account", {
  id: text().primaryKey(),
  name: text().notNull(),
  type: text().notNull(), // "checking" | "savings" | "investment" | "cash" | "other"
  balance: real().notNull().default(0),
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
