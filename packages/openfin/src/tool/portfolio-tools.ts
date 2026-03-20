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
      title: `Posición: ${pos.symbol}`,
      output: [
        `✓ ${pos.symbol} — ${pos.quantity} unidades @ ${fmt(pos.avg_cost, pos.currency)} c/u`,
        `Costo total: ${fmt(costBasis, pos.currency)}`,
        pos.quantity !== quantity
          ? `(posición existente — nuevo promedio calculado)`
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
        title: "Portfolio vacío",
        output: "No hay posiciones registradas en el portafolio.",
      }
    }

    const lines: string[] = ["PORTAFOLIO DE INVERSIONES", "─".repeat(48)]
    let totalCost = 0

    for (const pos of positions) {
      const costBasis = pos.quantity * pos.avg_cost
      totalCost += costBasis
      lines.push(
        `${pos.symbol.padEnd(10)} ${pos.quantity} uds @ ${fmt(pos.avg_cost, pos.currency)} = ${fmt(costBasis, pos.currency)}`,
      )
      if (pos.name) lines.push(`  ${pos.name}`)
      if (pos.notes) lines.push(`  Nota: ${pos.notes}`)
      lines.push(`  id: ${pos.id}`)
    }

    lines.push("─".repeat(48))
    lines.push(`${positions.length} posiciones | Costo total: ~${fmt(totalCost)} (sin conversión FX)`)

    return {
      title: `Portafolio (${positions.length} posiciones)`,
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
        title: "Posición no encontrada",
        output: `No existe ninguna posición con ID "${id}".`,
      }
    }
    return {
      title: `Actualizado: ${pos.symbol}`,
      output: `✓ ${pos.symbol} actualizado — ${pos.quantity} uds @ ${fmt(pos.avg_cost, pos.currency)} c/u`,
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
        title: "Posición no encontrada",
        output: `No existe ninguna posición con ID "${id}".`,
      }
    }
    Profile.closePosition(id)
    return {
      title: `Cerrada: ${pos.symbol}`,
      output: `✓ Posición ${pos.symbol} (${pos.quantity} uds) eliminada del portafolio.`,
    }
  },
})

// ── exports ───────────────────────────────────────────────────────────────────

export const PortfolioTools = [AddPositionTool, ListPortfolioTool, UpdatePositionTool, ClosePositionTool]
