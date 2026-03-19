import z from "zod"
import { Tool } from "./tool"

// ── Yahoo Finance response shape (minimal) ───────────────────────────────────

interface YahooQuote {
  regularMarketPrice?: number
  regularMarketChange?: number
  regularMarketChangePercent?: number
  shortName?: string
  currency?: string
  marketState?: string
}

interface YahooResponse {
  quoteResponse?: {
    result?: YahooQuote[]
    error?: string | null
  }
}

// ── Yahoo Finance crumb/cookie auth ──────────────────────────────────────────
// Yahoo requires a session cookie + crumb since late 2023.
// We obtain them once and reuse until a 401 forces a refresh.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

let _cookie: string | null = null
let _crumb: string | null = null

async function refreshAuth(): Promise<void> {
  // Step 1: hit the consent endpoint to receive a session cookie
  const consentRes = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
  })
  const raw = consentRes.headers.get("set-cookie") ?? ""
  // keep only the first key=value pair from the Set-Cookie header
  _cookie = raw.split(";")[0] ?? ""

  // Step 2: exchange the cookie for a crumb
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: _cookie },
    signal: AbortSignal.timeout(8_000),
  })
  if (!crumbRes.ok) {
    throw new Error(`Yahoo Finance: failed to obtain crumb (HTTP ${crumbRes.status})`)
  }
  _crumb = await crumbRes.text()
}

async function fetchQuote(symbol: string): Promise<YahooQuote> {
  // Lazy-init auth on first call
  if (!_crumb || !_cookie) await refreshAuth()

  const url =
    `https://query1.finance.yahoo.com/v7/finance/quote` +
    `?symbols=${encodeURIComponent(symbol)}` +
    `&crumb=${encodeURIComponent(_crumb!)}` +
    `&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName,currency,marketState`

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Cookie: _cookie! },
    signal: AbortSignal.timeout(8_000),
  })

  // On 401 the crumb expired — refresh once and retry
  if (res.status === 401) {
    _crumb = null
    _cookie = null
    await refreshAuth()
    return fetchQuote(symbol)
  }

  if (!res.ok) throw new Error(`Yahoo Finance returned HTTP ${res.status} for "${symbol}"`)

  const json = (await res.json()) as YahooResponse
  const quote = json.quoteResponse?.result?.[0]
  if (!quote) throw new Error(`No data found for symbol "${symbol}"`)

  return quote
}

function formatOutput(symbol: string, q: YahooQuote): string {
  const price = q.regularMarketPrice?.toFixed(2) ?? "N/A"
  const currency = q.currency ?? "USD"
  const change = q.regularMarketChange?.toFixed(2) ?? "0.00"
  const pct = q.regularMarketChangePercent?.toFixed(2) ?? "0.00"
  const direction = Number(q.regularMarketChange ?? 0) >= 0 ? "▲" : "▼"
  const name = q.shortName ? ` (${q.shortName})` : ""
  const state = q.marketState ? ` [${q.marketState}]` : ""

  return `${symbol.toUpperCase()}${name}: ${price} ${currency} ${direction} ${change} (${pct}%)${state}`
}

// ── Tool definition ───────────────────────────────────────────────────────────

export const GetPriceTool = Tool.define("get_price", {
  description:
    "Fetch the current market price of a stock, ETF, index, or crypto symbol. " +
    "Returns the price, daily change, and market state (REGULAR, PRE, POST, CLOSED). " +
    "Use ticker symbols: AAPL, MSFT, SPY, BTC-USD, ^GSPC (S&P 500), ^DJI (Dow Jones).",

  parameters: z.object({
    symbol: z
      .string()
      .min(1)
      .describe("Ticker symbol to look up, e.g. AAPL, BTC-USD, ^GSPC. Case-insensitive."),
  }),

  async execute({ symbol }, ctx) {
    const upper = symbol.toUpperCase()

    if (ctx.abort.aborted) throw new Error("Tool call aborted")

    const quote = await fetchQuote(upper)
    const output = formatOutput(upper, quote)

    return {
      title: `Price: ${upper}`,
      output,
      metadata: {
        symbol: upper,
        price: quote.regularMarketPrice,
        change: quote.regularMarketChange,
        changePercent: quote.regularMarketChangePercent,
        currency: quote.currency,
        marketState: quote.marketState,
      },
    }
  },
})
