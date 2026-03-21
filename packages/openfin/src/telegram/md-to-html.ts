/**
 * Convert standard Markdown (as produced by the LLM) to Telegram HTML.
 * Only handles the subset the LLM typically emits.
 * Reference: https://core.telegram.org/bots/api#html-style
 */
export function mdToTelegramHtml(text: string): string {
  const parts: string[] = []

  // Split on fenced code blocks first (protect their content from further processing)
  const segments = text.split(/(```(?:\w+)?\n[\s\S]*?```)/g)

  for (const seg of segments) {
    const fencedMatch = seg.match(/^```(?:\w+)?\n([\s\S]*?)```$/)
    if (fencedMatch) {
      parts.push(`<pre><code>${escapeHtml(fencedMatch[1]!)}</code></pre>`)
      continue
    }

    // Split on inline code spans (protect their content too)
    const inlineSegments = seg.split(/(`[^`\n]+`)/g)
    let result = ""

    for (const part of inlineSegments) {
      const inlineMatch = part.match(/^`([^`\n]+)`$/)
      if (inlineMatch) {
        result += `<code>${escapeHtml(inlineMatch[1]!)}</code>`
        continue
      }

      // Regular text: escape HTML first, then apply formatting
      let t = escapeHtml(part)

      // Bold: **text** or __text__
      t = t.replace(/\*\*(.+?)\*\*/gs, "<b>$1</b>")
      t = t.replace(/__(.+?)__/gs, "<b>$1</b>")

      // Italic: *text* (single asterisk, not touching bold)
      t = t.replace(/\*([^*\n]+)\*/g, "<i>$1</i>")
      // Italic: _text_ (only if not part of a word boundary to avoid false positives)
      t = t.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "<i>$1</i>")

      // Headers: # Heading → <b>Heading</b>
      t = t.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>")

      // Unordered list items: - item or * item → • item
      t = t.replace(/^[-*]\s+/gm, "• ")

      result += t
    }

    parts.push(result)
  }

  return parts.join("")
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
