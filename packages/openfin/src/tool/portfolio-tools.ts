import z from "zod"
import { Tool } from "./tool"
import { Profile } from "../profile/profile"

const fmt = (n: number, currency = "USD") =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`

// ── add_position ──────────────────────────────────────────────────────────────

export const AddPositionTool = Tool.define("add_position", {
  description:
    "Add a new investment position or buy more of an existing one. " +
    "If the symbol already exists, the quantity is added and the average cost is recalculated (weighted average). " +
    "Use this when the user buys a stock, ETF, crypto, or any other asset.",

  parameters: z.object({
    symbol: z
      .string()
      .describe("Ticker symbol, e.g. AAPL, BTC-USD, VOO, AMXL.MX. Will be uppercased."),
    quantity: z.number().positive().describe("Number of shares/units purchased"),
    avg_cost: z.number().positive().describe("Purchase price per unit (cost basis)"),
    currency: z.string().optional().describe("Currency of the purchase price, default USD"),
    asset_type: z
      .enum(["stock", "etf", "crypto", "other"])
      .optional()
      .describe("Asset type, default 'stock'"),
    name: z.string().optional().describe("Human-readable name, e.g. 'Apple Inc.'"),
    notes: z.string().optional(),
  }),

  async execute({ symbol, quantity, avg_cost, currency, asset_type, name, notes }) {
    const pos = Profile.addPosition({ symbol, quantity, avg_cost, currency, asset_type, name, notes })
    const costBasis = pos.quantity * pos.avg_cost
    return {
      title: `Position: ${pos.symbol}`,
      output: [
        `✓ ${pos.symbol} — ${pos.quantity} units @ ${fmt(pos.avg_cost, pos.currency)} each`,
        `Total cost: ${fmt(costBasis, pos.currency)}`,
        pos.quantity !== quantity
          ? `(existing position — new average calculated)`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: { id: pos.id, symbol: pos.symbol, quantity: pos.quantity, avg_cost: pos.avg_cost },
    }
  },
})

// ── list_portfolio ────────────────────────────────────────────────────────────

export const ListPortfolioTool = Tool.define("list_portfolio", {
  description:
    "List all portfolio positions with their cost basis and total invested. " +
    "Does NOT fetch live prices — use get_price separately for current valuations. " +
    "Use this to review what assets are held and their original cost.",

  parameters: z.object({}),

  async execute() {
    const positions = Profile.listPositions()

    if (positions.length === 0) {
      return {
        title: "Empty portfolio",
        output: "No positions recorded in the portfolio.",
      }
    }

    const lines: string[] = ["INVESTMENT PORTFOLIO", "─".repeat(48)]
    let totalCost = 0

    for (const pos of positions) {
      const costBasis = pos.quantity * pos.avg_cost
      totalCost += costBasis
      lines.push(
        `${pos.symbol.padEnd(10)} ${pos.quantity} units @ ${fmt(pos.avg_cost, pos.currency)} = ${fmt(costBasis, pos.currency)}`,
      )
      if (pos.name) lines.push(`  ${pos.name}`)
      if (pos.notes) lines.push(`  Note: ${pos.notes}`)
      lines.push(`  id: ${pos.id}`)
    }

    lines.push("─".repeat(48))
    lines.push(`${positions.length} positions | Total cost: ~${fmt(totalCost)} (no FX conversion)`)

    return {
      title: `Portfolio (${positions.length} positions)`,
      output: lines.join("\n"),
      metadata: { count: positions.length },
    }
  },
})

// ── update_position ───────────────────────────────────────────────────────────

export const UpdatePositionTool = Tool.define("update_position", {
  description:
    "Update an existing portfolio position by its ID. " +
    "Use this to correct quantity, avg_cost, name, or notes. " +
    "To buy more shares use add_position instead (it handles weighted average automatically).",

  parameters: z.object({
    id: z.string().describe("Position ID (from list_portfolio)"),
    quantity: z.number().positive().optional().describe("New total quantity held"),
    avg_cost: z.number().positive().optional().describe("New average cost per unit"),
    name: z.string().optional().describe("Display name"),
    notes: z.string().optional(),
  }),

  async execute({ id, quantity, avg_cost, name, notes }) {
    const pos = Profile.updatePosition(id, { quantity, avg_cost, name, notes })
    if (!pos) {
      return {
        title: "Position not found",
        output: `No position found with ID "${id}".`,
      }
    }
    return {
      title: `Updated: ${pos.symbol}`,
      output: `✓ ${pos.symbol} updated — ${pos.quantity} units @ ${fmt(pos.avg_cost, pos.currency)} each`,
      metadata: { id: pos.id, symbol: pos.symbol },
    }
  },
})

// ── close_position ────────────────────────────────────────────────────────────

export const ClosePositionTool = Tool.define("close_position", {
  description:
    "Remove a position from the portfolio (fully sold or closed). " +
    "This permanently deletes the position record. " +
    "Use this when the user sells all shares of a position.",

  parameters: z.object({
    id: z.string().describe("Position ID (from list_portfolio)"),
  }),

  async execute({ id }) {
    const positions = Profile.listPositions()
    const pos = positions.find((p) => p.id === id)
    if (!pos) {
      return {
        title: "Position not found",
        output: `No position found with ID "${id}".`,
      }
    }
    Profile.closePosition(id)
    return {
      title: `Closed: ${pos.symbol}`,
      output: `✓ Position ${pos.symbol} (${pos.quantity} units) removed from portfolio.`,
    }
  },
})

// ── exports ───────────────────────────────────────────────────────────────────

export const PortfolioTools = [AddPositionTool, ListPortfolioTool, UpdatePositionTool, ClosePositionTool]
