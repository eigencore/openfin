import { Hono } from "hono"
import { lazy } from "../../util/lazy"
import { Profile } from "../../profile/profile"

export const ProfileRoutes = lazy(() =>
  new Hono().get("/dashboard", (c) => {
    const accounts = Profile.listAccounts()
    const debts = Profile.listDebts()
    const budgets = Profile.listBudgets()
    const goals = Profile.listGoals()
    const alerts = Profile.getAlerts()
    const spent = Profile.currentMonthExpensesByCategory()

    const assets = accounts.reduce((s, a) => s + a.balance, 0)
    const totalDebts = debts.reduce((s, d) => s + d.balance, 0)

    // Net worth history — last 30 days for sparkline/chart
    const history = Profile.getNetWorthHistory(30)
    const latest = history[0]
    const previous = history[1]
    const delta = latest && previous ? latest.net_worth - previous.net_worth : undefined

    // Top expenses this month sorted descending
    const topExpenses = [...spent.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)

    return c.json({
      netWorth: {
        assets,
        debts: totalDebts,
        net_worth: assets - totalDebts,
        currency: "MXN",
        delta,
      },
      netWorthHistory: history.map((h) => ({ date: h.date, value: h.net_worth })).reverse(),
      topExpenses,
      income: Profile.getIncome(),
      upcoming: Profile.upcomingRecurring(14).map((r) => ({
        title: r.title,
        amount: r.amount,
        type: r.type,
        category: r.category,
        currency: r.currency,
        next_due: r.next_due,
      })),
      accounts: accounts.map((a) => ({
        name: a.name,
        type: a.type,
        balance: a.balance,
        currency: a.currency,
        institution: a.institution ?? null,
        credit_limit: a.credit_limit ?? null,
      })),
      debts: debts.map((d) => ({
        name: d.name,
        type: d.type,
        balance: d.balance,
        currency: d.currency,
        due_day: d.due_day ?? null,
        interest_rate: d.interest_rate ?? null,
        min_payment: d.min_payment ?? null,
      })),
      budgets: budgets.map((b) => ({
        category: b.category,
        amount: b.amount,
        spent: spent.get(b.category.toLowerCase()) ?? 0,
        currency: b.currency,
        period: b.period,
      })),
      goals: goals.map((g) => ({
        name: g.name,
        target_amount: g.target_amount,
        current_amount: g.current_amount,
        currency: g.currency,
        target_date: g.target_date ?? null,
        time_created: g.time_created,
      })),
      alerts,
    })
  }),
)
