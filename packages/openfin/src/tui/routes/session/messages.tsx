import { createEffect, createMemo, createSignal, For, Show, Switch, Match } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { SplitBorder } from "../../component/border"
import { Spinner } from "../../component/spinner"
import type { ScrollBoxRenderable, SyntaxStyle } from "@opentui/core"
import type { Message } from "@/session/message"
import type { MessageRow } from "../../context/sdk"

class CustomSpeedScroll {
  constructor(private speed: number) {}
  tick(): number { return this.speed }
  reset(): void {}
}

const scrollAccel = new CustomSpeedScroll(3)

interface MessagesProps {
  sessionID: string
}

// StreamingEntry carries no reactive content — content is read inside the component
// so that displayItems does NOT recompute on every SSE chunk.
type StreamingEntry = { id: string; _streaming: true }
type DisplayItem = MessageRow | StreamingEntry

const STREAMING_ENTRY: StreamingEntry = { id: "__streaming", _streaming: true }

export function MessageList(props: MessagesProps) {
  const { theme, syntax } = useTheme()
  const sync = useSync()
  let scroll: ScrollBoxRenderable

  const messages = createMemo(() => sync.store.messages[props.sessionID] ?? [])
  const streaming = createMemo(() => sync.store.streaming[props.sessionID])
  const isStreaming = createMemo(() => {
    const s = streaming()
    return s && !s.done
  })

  // Show streaming entry while streaming state EXISTS (even when done=true while
  // messages are loading). Removal is now atomic with message load in sync.tsx,
  // so there's no gap between streaming bubble and committed message appearing.
  const displayItems = createMemo((): DisplayItem[] => {
    const msgs = messages()
    const s = streaming()
    if (s) {
      return [...msgs, STREAMING_ENTRY]
    }
    return msgs
  })

  function toBottom() {
    setTimeout(() => {
      if (!scroll || (scroll as any).isDestroyed) return
      scroll.scrollTo(scroll.scrollHeight)
    }, 50)
  }

  // Only scroll to bottom when the message COUNT changes (new message committed),
  // not on every streaming content update. stickyScroll={true} handles the rest.
  createEffect(() => {
    const _count = messages().length
    toBottom()
  })

  return (
    <scrollbox
      ref={(r: ScrollBoxRenderable) => {
        scroll = r
        setTimeout(() => r?.scrollTo(r.scrollHeight), 50)
      }}
      flexGrow={1}
      stickyScroll={true}
      stickyStart="bottom"
      scrollAcceleration={scrollAccel}
      verticalScrollbarOptions={{
        paddingLeft: 1,
        trackOptions: {
          backgroundColor: theme().backgroundElement,
          foregroundColor: theme().border,
        },
      }}
    >
      <For each={displayItems()}>
        {(item, index) => {
          if ("_streaming" in item) {
            return (
              <StreamingAssistantBubble
                sessionID={props.sessionID}
                syntax={syntax()}
              />
            )
          }
          const msg = item as MessageRow
          return (
            <Show
              when={msg.data.role === "user"}
              fallback={
                <AssistantBubble
                  messageID={msg.id}
                  content={msg.data.content}
                  model={msg.data.role === "assistant" ? msg.data.model : undefined}
                  duration={
                    msg.data.role === "assistant" && msg.data.time_completed
                      ? msg.data.time_completed - msg.time.created
                      : undefined
                  }
                  syntax={syntax()}
                />
              }
            >
              <UserBubble content={msg.data.content} index={index()} />
            </Show>
          )
        }}
      </For>
    </scrollbox>
  )
}

function UserBubble(props: { content: string; index: number }) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)

  return (
    <box
      border={["left"]}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={theme().accent}
      marginTop={props.index === 0 ? 0 : 1}
    >
      <box
        onMouseOver={() => setHover(true)}
        onMouseOut={() => setHover(false)}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        backgroundColor={hover() ? theme().backgroundElement : theme().backgroundPanel}
        flexShrink={0}
      >
        <text fg={theme().text}>{props.content}</text>
      </box>
    </box>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

function AssistantBubble(props: {
  messageID: string
  content: string
  model?: string
  duration?: number
  syntax: SyntaxStyle
}) {
  const { theme } = useTheme()
  const sync = useSync()

  const parts = createMemo(() => {
    const all = sync.store.parts[props.messageID] ?? []
    return all.filter((p): p is Message.ToolPart => p.type === "tool")
  })

  return (
    <box marginTop={1} flexShrink={0}>
      {/* Tool parts rendered before the text */}
      <For each={parts()}>
        {(part) => <ToolPartRow part={part} />}
      </For>
      {/* Text content */}
      <Show when={props.content.trim()}>
        <box paddingLeft={3}>
          <code
            filetype="markdown"
            drawUnstyledText={false}
            streaming={false}
            syntaxStyle={props.syntax}
            content={props.content.trim()}
            fg={theme().text}
          />
        </box>
      </Show>
      {/* Footer: ▣ model · duration */}
      <Show when={props.model}>
        <box paddingLeft={3} marginTop={1}>
          <text>
            <span style={{ fg: theme().accent }}>▣ </span>
            <span style={{ fg: theme().textMuted }}>{props.model}</span>
            <Show when={props.duration}>
              <span style={{ fg: theme().textMuted }}> · {formatDuration(props.duration!)}</span>
            </Show>
          </text>
        </box>
      </Show>
    </box>
  )
}

function StreamingAssistantBubble(props: { sessionID: string; syntax: SyntaxStyle }) {
  const { theme } = useTheme()
  const sync = useSync()

  // Read content directly from store — fine-grained reactive update inside this component
  const content = createMemo(() => sync.store.streaming[props.sessionID]?.content ?? "")

  // Collect tool parts from all streaming messages (keyed by messageID)
  const toolParts = createMemo(() => {
    const allParts = sync.store.parts
    const result: Message.ToolPart[] = []
    for (const [, msgParts] of Object.entries(allParts)) {
      for (const p of msgParts) {
        if (p.type === "tool") result.push(p)
      }
    }
    // Deduplicate by id, keep last
    const seen = new Map<string, Message.ToolPart>()
    for (const p of result) seen.set(p.id, p)
    return Array.from(seen.values())
  })

  // Only show tool parts that belong to the current streaming session
  const sessionToolParts = createMemo(() =>
    toolParts().filter((p) => p.sessionID === props.sessionID),
  )

  return (
    <box marginTop={1} flexShrink={0}>
      <For each={sessionToolParts()}>
        {(part) => <ToolPartRow part={part} />}
      </For>
      <Show
        when={content()}
        fallback={
          <box paddingLeft={3}>
            <Spinner>Thinking...</Spinner>
          </box>
        }
      >
        <box paddingLeft={3}>
          <code
            filetype="markdown"
            drawUnstyledText={false}
            streaming={true}
            syntaxStyle={props.syntax}
            content={content().trim()}
            fg={theme().text}
          />
        </box>
      </Show>
    </box>
  )
}

// ── Tool rendering ─────────────────────────────────────────────────────────────

function ToolPartRow(props: { part: Message.ToolPart }) {
  return (
    <Switch fallback={<GenericTool part={props.part} />}>
      <Match when={props.part.tool === "upsert_account"}>
        <AccountTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "upsert_debt"}>
        <DebtTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "upsert_budget"}>
        <BudgetTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "upsert_goal"}>
        <GoalTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "log_transaction"}>
        <TransactionTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "analyze_expenses"}>
        <AnalyzeTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "get_price"}>
        <PriceTool part={props.part} />
      </Match>
    </Switch>
  )
}

// ── Specialized financial tool renderers ───────────────────────────────────────

function AccountTool(props: { part: Message.ToolPart }) {
  const inp = () => props.part.state.input as { name?: string; type?: string }
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  return (
    <InlineTool
      icon="⊕"
      pending={`Saving account ${inp().name ?? ""}...`}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
    >
      {title() ?? `Account ${inp().name ?? ""}`}
    </InlineTool>
  )
}

function DebtTool(props: { part: Message.ToolPart }) {
  const inp = () => props.part.state.input as { name?: string }
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  return (
    <InlineTool
      icon="−"
      pending={`Saving debt ${inp().name ?? ""}...`}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
    >
      {title() ?? `Debt ${inp().name ?? ""}`}
    </InlineTool>
  )
}

function BudgetTool(props: { part: Message.ToolPart }) {
  const inp = () => props.part.state.input as { category?: string }
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  return (
    <InlineTool
      icon="≡"
      pending={`Saving budget ${inp().category ?? ""}...`}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
    >
      {title() ?? `Budget ${inp().category ?? ""}`}
    </InlineTool>
  )
}

function GoalTool(props: { part: Message.ToolPart }) {
  const inp = () => props.part.state.input as { name?: string }
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  return (
    <InlineTool
      icon="◎"
      pending={`Saving goal ${inp().name ?? ""}...`}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
    >
      {title() ?? `Goal ${inp().name ?? ""}`}
    </InlineTool>
  )
}

function TransactionTool(props: { part: Message.ToolPart }) {
  const inp = () => props.part.state.input as { type?: string; amount?: number; category?: string; description?: string }
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  const pendingLabel = () => {
    const i = inp()
    const dir = i.type === "income" ? "income" : "expense"
    const amount = i.amount != null ? ` $${i.amount}` : ""
    return `Logging ${dir}${amount}...`
  }

  return (
    <InlineTool
      icon="↔"
      pending={pendingLabel()}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
    >
      {title() ?? (inp().description ?? "Transaction")}
    </InlineTool>
  )
}

function AnalyzeTool(props: { part: Message.ToolPart }) {
  const { theme } = useTheme()
  const inp = () => props.part.state.input as { period?: string }
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const output = () => (props.part.state.status === "completed" ? props.part.state.output : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  const [expanded, setExpanded] = createSignal(false)
  const outputLines = createMemo(() => output()?.split("\n") ?? [])
  const overflow = createMemo(() => outputLines().length > 10)
  const limitedOutput = createMemo(() => {
    const o = output() ?? ""
    if (!overflow() || expanded()) return o
    return [...outputLines().slice(0, 10), "…"].join("\n")
  })

  return (
    <Show
      when={isCompleted()}
      fallback={
        <InlineTool
          icon="≡"
          pending={`Analyzing ${inp().period ?? "expenses"}...`}
          running={isRunning()}
          complete={isError()}
          error={error()}
        >
          {title() ?? `Analyze ${inp().period ?? ""}`}
        </InlineTool>
      }
    >
      <BlockTool
        title={title() ?? "Analysis"}
        running={false}
        error={error()}
        onClick={overflow() ? () => setExpanded((p) => !p) : undefined}
      >
        <box gap={1}>
          <text fg={theme().text}>{limitedOutput()}</text>
          <Show when={overflow()}>
            <text fg={theme().textMuted}>{expanded() ? "Click to collapse" : "Click to expand"}</text>
          </Show>
        </box>
      </BlockTool>
    </Show>
  )
}

function PriceTool(props: { part: Message.ToolPart }) {
  const inp = () => props.part.state.input as { symbol?: string }
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  return (
    <InlineTool
      icon="$"
      pending={`Fetching ${inp().symbol ?? "price"}...`}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
    >
      {title() ?? `Price ${inp().symbol ?? ""}`}
    </InlineTool>
  )
}

function GenericTool(props: { part: Message.ToolPart }) {
  const { theme } = useTheme()
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const output = () => (props.part.state.status === "completed" ? props.part.state.output : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  const [expanded, setExpanded] = createSignal(false)
  const outputLines = createMemo(() => output()?.split("\n") ?? [])
  const overflow = createMemo(() => outputLines().length > 8)
  const limitedOutput = createMemo(() => {
    const o = output() ?? ""
    if (!overflow() || expanded()) return o
    return [...outputLines().slice(0, 8), "…"].join("\n")
  })

  return (
    <Show
      when={output() !== undefined}
      fallback={
        <InlineTool
          icon="⚙"
          pending={`${props.part.tool}...`}
          running={isRunning()}
          complete={isCompleted() || isError()}
          error={error()}
        >
          {title() ?? props.part.tool}
        </InlineTool>
      }
    >
      <BlockTool
        title={title() ?? props.part.tool}
        running={isRunning()}
        error={error()}
        onClick={overflow() ? () => setExpanded((p) => !p) : undefined}
      >
        <box gap={1}>
          <text fg={theme().text}>{limitedOutput()}</text>
          <Show when={overflow()}>
            <text fg={theme().textMuted}>{expanded() ? "Click to collapse" : "Click to expand"}</text>
          </Show>
        </box>
      </BlockTool>
    </Show>
  )
}

function InlineTool(props: {
  icon: string
  pending: string
  complete: boolean
  running: boolean
  error: string | undefined
  children: any
}) {
  const { theme } = useTheme()

  const fg = createMemo(() => {
    if (props.error) return theme().error
    if (props.running) return theme().text
    if (props.complete) return theme().textMuted
    return theme().textMuted
  })

  return (
    <box paddingLeft={3} marginTop={0}>
      <Show
        when={props.running}
        fallback={
          <text paddingLeft={3} fg={fg()}>
            <Show fallback={<>~ {props.pending}</>} when={props.complete || props.error}>
              <span style={{ bold: false }}>{props.icon}</span>{" "}
              {props.children}
            </Show>
          </text>
        }
      >
        <Spinner color={fg()}>{props.children}</Spinner>
      </Show>
      <Show when={props.error}>
        <text fg={theme().error}>{props.error}</text>
      </Show>
    </box>
  )
}

function BlockTool(props: {
  title: string
  running: boolean
  error?: string
  onClick?: () => void
  children: any
}) {
  const { theme } = useTheme()
  const [hover, setHover] = createSignal(false)

  return (
    <box
      border={["left"]}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      marginTop={1}
      gap={1}
      backgroundColor={hover() ? theme().backgroundElement : theme().backgroundPanel}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={theme().background}
      onMouseOver={() => props.onClick && setHover(true)}
      onMouseOut={() => setHover(false)}
      onMouseUp={() => props.onClick?.()}
    >
      <Show
        when={props.running}
        fallback={
          <text paddingLeft={3} fg={theme().textMuted}>
            {props.title}
          </text>
        }
      >
        <Spinner color={theme().textMuted}>{props.title}</Spinner>
      </Show>
      {props.children}
      <Show when={props.error}>
        <text fg={theme().error}>{props.error}</text>
      </Show>
    </box>
  )
}
