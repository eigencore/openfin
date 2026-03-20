import { createMemo, createSignal, For, Show } from "solid-js"
import { TextAttributes } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"

// ── Line parsing ──────────────────────────────────────────────────────────────

const UUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{8})([0-9a-f]{4})\s+(.*)/

interface Segment {
  text: string
  color: "text" | "muted" | "accent" | "positive" | "negative" | "bold" | "header" | "warning"
}

function parseDataLine(raw: string): Segment[] {
  const trimmed = raw.trimStart()
  const indent = raw.length - trimmed.length
  const segments: Segment[] = []

  if (indent > 0) segments.push({ text: " ".repeat(indent), color: "text" })

  // UUID prefix → abbreviate to last 4 chars of the full id
  const uuidMatch = trimmed.match(UUID_RE)
  if (uuidMatch) {
    segments.push({ text: `…${uuidMatch[2]}`, color: "muted" })
    segments.push({ text: "  ", color: "text" })
    segments.push(...parseTransactionRest(uuidMatch[3]!))
    return segments
  }

  // TOTAL summary line
  if (trimmed.startsWith("TOTAL")) {
    const parts = trimmed.split(/\s{2,}/)
    segments.push({ text: parts[0] ?? trimmed, color: "accent" })
    if (parts[1]) {
      segments.push({ text: "  ", color: "text" })
      segments.push({ text: parts[1], color: "negative" })
    }
    return segments
  }

  segments.push(...parseGenericRow(trimmed))
  return segments
}

// Handles: "Mar 20 ↓ $1,287.00 MXN · Food — description [Account]"
function parseTransactionRest(text: string): Segment[] {
  const m = text.match(
    /^(\w+ \d+)\s+(↓|↑)\s+(\$[\d,.]+ \w+)\s+·\s+(\w+(?:\s+\w+)*)\s+—\s+(.+?)(\s+\[.+\])?$/,
  )
  if (!m) return [{ text, color: "text" }]
  const [, date, dir, amount, category, description, account] = m
  const segs: Segment[] = [
    { text: date!, color: "muted" },
    { text: "  ", color: "text" },
    { text: dir!, color: dir === "↑" ? "positive" : "negative" },
    { text: "  ", color: "text" },
    { text: amount!, color: "bold" },
    { text: "  ·  ", color: "muted" },
    { text: category!, color: "accent" },
    { text: "  —  ", color: "muted" },
    { text: description!, color: "text" },
  ]
  if (account) segs.push({ text: account.trim(), color: "muted" })
  return segs
}

// Handles accounts/debts/budgets/goals rows:
// "  Name                    $1,234.00 MXN  Institution"
// "  Category               75%  $750 / $1,000"
function parseGenericRow(text: string): Segment[] {
  // Detect percentage (budgets / goals)
  const pctMatch = text.match(/^(.+?)\s{2,}(\d+%)\s+(.+)$/)
  if (pctMatch) {
    const pct = parseInt(pctMatch[2]!, 10)
    const color: Segment["color"] = pct >= 100 ? "negative" : pct >= 80 ? "warning" : "positive"
    return [
      { text: pctMatch[1]!, color: "text" },
      { text: "  ", color: "text" },
      { text: pctMatch[2]!, color },
      { text: "  ", color: "text" },
      { text: pctMatch[3]!, color: "muted" },
    ]
  }

  // Detect negative amounts (debts)
  if (text.includes("-$") || (text.match(/\$[\d,]/) && text.includes("↓"))) {
    const parts = text.split(/\s{2,}/)
    return parts.flatMap((p, i): Segment[] => [
      ...(i > 0 ? [{ text: "  ", color: "text" as const }] : []),
      { text: p, color: p.startsWith("-$") ? "negative" : "text" },
    ])
  }

  return [{ text, color: "text" }]
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DialogOutputProps {
  title: string
  lines: string[]
}

export function DialogOutput(props: DialogOutputProps) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const dims = useTerminalDimensions()
  const [scrollOffset, setScrollOffset] = createSignal(0)

  const width = createMemo(() => Math.min(100, dims().width - 6))
  const left = createMemo(() => Math.floor((dims().width - width()) / 2))
  const maxBodyH = createMemo(() => Math.max(4, dims().height - 12))

  // Split into header (first non-empty line) and data lines
  const headerLine = createMemo(() => props.lines.find((l) => l.trim().length > 0) ?? "")
  const dataLines = createMemo(() => {
    const idx = props.lines.findIndex((l) => l.trim().length > 0)
    return idx >= 0 ? props.lines.slice(idx + 1) : props.lines
  })

  const visibleH = createMemo(() => Math.min(dataLines().length, maxBodyH()))
  const top = createMemo(() => Math.floor((dims().height - visibleH() - 8) / 2))
  const canScroll = createMemo(() => dataLines().length > maxBodyH())
  const maxScroll = createMemo(() => Math.max(0, dataLines().length - maxBodyH()))
  const visibleLines = createMemo(() =>
    dataLines().slice(scrollOffset(), scrollOffset() + maxBodyH()),
  )

  useKeyboard((key) => {
    if (key.name === "up" || (key.name === "k" && !key.ctrl)) {
      setScrollOffset((s) => Math.max(0, s - 1))
      return true
    }
    if (key.name === "down" || (key.name === "j" && !key.ctrl)) {
      setScrollOffset((s) => Math.min(maxScroll(), s + 1))
      return true
    }
    if (key.name === "pageup") {
      setScrollOffset((s) => Math.max(0, s - maxBodyH()))
      return true
    }
    if (key.name === "pagedown") {
      setScrollOffset((s) => Math.min(maxScroll(), s + maxBodyH()))
      return true
    }
    return false
  })

  function segColor(c: Segment["color"]) {
    const t = theme()
    switch (c) {
      case "header":  return t.accent
      case "accent":  return t.accent
      case "muted":   return t.textMuted
      case "positive": return t.success
      case "negative": return t.error
      case "warning": return t.warning
      case "bold":    return t.text
      default:        return t.text
    }
  }

  return (
    <box
      position="absolute"
      top={top()}
      left={left()}
      width={width()}
      flexDirection="column"
      backgroundColor={theme().backgroundPanel}
      border={true}
      borderColor={theme().borderActive}
      borderStyle="rounded"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={3}
      paddingRight={3}
    >
      {/* Header */}
      <box flexDirection="row" marginBottom={1} alignItems="center">
        <text fg={theme().accent} attributes={TextAttributes.BOLD}>
          {headerLine()}
        </text>
        <Show when={canScroll()}>
          <text fg={theme().textMuted} marginLeft={2}>
            {scrollOffset() + 1}–{Math.min(scrollOffset() + maxBodyH(), dataLines().length)}/{dataLines().length}
          </text>
        </Show>
      </box>

      {/* Divider */}
      <text fg={theme().border}>{"─".repeat(width() - 6)}</text>

      {/* Data rows */}
      <box flexDirection="column" marginTop={1}>
        <For each={visibleLines()}>
          {(line) => {
            if (!line.trim()) return <box height={1} />
            const segs = parseDataLine(line)
            return (
              <box flexDirection="row" height={1}>
                <For each={segs}>
                  {(seg) => (
                    <text
                      fg={segColor(seg.color)}
                      attributes={seg.color === "bold" ? TextAttributes.BOLD : undefined}
                    >
                      {seg.text}
                    </text>
                  )}
                </For>
              </box>
            )
          }}
        </For>
      </box>

      {/* Footer */}
      <text fg={theme().border} marginTop={1}>{"─".repeat(width() - 6)}</text>
      <box flexDirection="row" marginTop={1} gap={3}>
        <text fg={theme().textMuted}>Esc  close</text>
        <Show when={canScroll()}>
          <text fg={theme().textMuted}>↑↓  scroll</text>
        </Show>
      </box>
    </box>
  )
}
