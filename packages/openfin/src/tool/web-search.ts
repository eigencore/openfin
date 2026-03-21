import z from "zod"
import { Tool } from "./tool"

// ── Tavily API types ──────────────────────────────────────────────────────────

interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

interface TavilyResponse {
  answer?: string
  results: TavilyResult[]
}

// ── search_web ────────────────────────────────────────────────────────────────

export const WebSearchTool = Tool.define("search_web", {
  description:
    "Search the internet for current information using Tavily. " +
    "Use this to find product prices, compare options across stores, check availability, or get up-to-date information. " +
    "When the user wants to buy something and no price is given, search for prices FIRST before calling evaluate_purchase. " +
    `Good queries: 'iPhone 16 Pro precio México ${new Date().getFullYear()}', 'precio Samsung TV 55 pulgadas MercadoLibre', 'laptop Dell XPS 13 precio MXN'. ` +
    "Returns a summary answer plus individual results with title, URL, and content snippet.",

  parameters: z.object({
    query: z.string().describe("Search query. Be specific: include product name, 'precio', country/currency if relevant."),
    search_depth: z
      .enum(["basic", "advanced"])
      .optional()
      .describe("'basic' for quick lookups, 'advanced' for detailed research. Defaults to 'basic'."),
  }),

  async execute({ query, search_depth = "basic" }) {
    const apiKey = process.env.TAVILY_API_KEY
    if (!apiKey) throw new Error("TAVILY_API_KEY is not set in environment variables")

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth,
        include_answer: true,
        max_results: 5,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`Tavily search failed (HTTP ${res.status}): ${body}`)
    }

    const data = (await res.json()) as TavilyResponse
    const lines: string[] = []

    lines.push(`SEARCH: ${query}`)
    lines.push("")

    if (data.answer) {
      lines.push(`SUMMARY: ${data.answer}`)
      lines.push("")
    }

    if (data.results.length === 0) {
      lines.push("No results found.")
    } else {
      lines.push("RESULTS:")
      for (const r of data.results) {
        lines.push(`  [${r.title}]`)
        lines.push(`  ${r.url}`)
        lines.push(`  ${r.content.slice(0, 300).replace(/\n/g, " ")}`)
        lines.push("")
      }
    }

    return {
      title: `Web search: ${query}`,
      output: lines.join("\n"),
      metadata: {
        query,
        resultCount: data.results.length,
        hasAnswer: !!data.answer,
      },
    }
  },
})
