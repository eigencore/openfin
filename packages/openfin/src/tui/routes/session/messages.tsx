import { createEffect, createMemo, createSignal, For, Show, Switch, Match } from "solid-js"
import type { RGBA } from "@opentui/core"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { useModels } from "../../context/models"
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
type ErrorEntry = { id: string; _error: true; message: string }
type DisplayItem = MessageRow | StreamingEntry | ErrorEntry

const STREAMING_ENTRY: StreamingEntry = { id: "__streaming", _streaming: true }

export function MessageList(props: MessagesProps) {
  const { theme, syntax } = useTheme()
  const sync = useSync()
  let scroll: ScrollBoxRenderable

  const messages = createMemo(() => sync.store.messages[props.sessionID] ?? [])
  const streaming = createMemo(() => sync.store.streaming[props.sessionID])
  const sessionError = createMemo(() => sync.store.errors[props.sessionID])
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
    const err = sessionError()
    if (s) return [...msgs, STREAMING_ENTRY]
    if (err) return [...msgs, { id: "__error", _error: true, message: err }]
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
          if ("_error" in item) {
            return <ErrorBubble message={(item as any).message} />
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
                  tokens={msg.data.role === "assistant" ? msg.data.tokens : undefined}
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

  return (
    <box marginTop={props.index === 0 ? 0 : 1} paddingLeft={2}>
      <text>
        <span style={{ fg: theme().accent }}>{"❯ "}</span>
        <span style={{ fg: theme().text }}>{props.content}</span>
      </text>
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
  tokens?: { input: number; output: number; total: number }
  syntax: SyntaxStyle
}) {
  const { theme } = useTheme()
  const sync = useSync()
  const { models } = useModels()
  const modelLabel = createMemo(() => {
    if (!props.model) return undefined
    return models().find((m) => m.id === props.model)?.name ?? props.model
  })

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
      {/* Footer: ▣ model · duration · ↑in ↓out */}
      <Show when={modelLabel()}>
        <box paddingLeft={3} marginTop={1}>
          <text>
            <span style={{ fg: theme().accent }}>▣ </span>
            <span style={{ fg: theme().textMuted }}>{modelLabel()}</span>
            <Show when={props.duration}>
              <span style={{ fg: theme().textMuted }}> · {formatDuration(props.duration!)}</span>
            </Show>
            <Show when={props.tokens}>
              <span style={{ fg: theme().textMuted }}>
                {" · "}↑{props.tokens!.input.toLocaleString()} ↓{props.tokens!.output.toLocaleString()}
              </span>
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

function ErrorBubble(props: { message: string }) {
  const { theme } = useTheme()

  return (
    <box marginTop={1} flexShrink={0}>
      <box
        border={["left"]}
        customBorderChars={SplitBorder.customBorderChars}
        borderColor={theme().error}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
      >
        <text fg={theme().error}>{props.message}</text>
      </box>
    </box>
  )
}

// ── Tool rendering ─────────────────────────────────────────────────────────────

function ToolPartRow(props: { part: Message.ToolPart }) {
  return (
    <Switch fallback={<GenericTool part={props.part} />}>
      {/* ── Mutation tools ── */}
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
      <Match when={props.part.tool === "pay_debt"}>
        <LabeledTool part={props.part} pendingLabel="Paying debt..." />
      </Match>
      <Match when={props.part.tool === "contribute_to_goal"}>
        <LabeledTool part={props.part} pendingLabel="Contributing to goal..." />
      </Match>
      <Match when={props.part.tool === "transfer_between_accounts"}>
        <LabeledTool part={props.part} pendingLabel="Transferring funds..." />
      </Match>
      <Match when={props.part.tool === "delete_account"}>
        <LabeledTool part={props.part} pendingLabel="Deleting account..." />
      </Match>
      <Match when={props.part.tool === "delete_debt"}>
        <LabeledTool part={props.part} pendingLabel="Deleting debt..." />
      </Match>
      <Match when={props.part.tool === "delete_budget"}>
        <LabeledTool part={props.part} pendingLabel="Deleting budget..." />
      </Match>
      <Match when={props.part.tool === "delete_goal"}>
        <LabeledTool part={props.part} pendingLabel="Deleting goal..." />
      </Match>
      <Match when={props.part.tool === "delete_transaction"}>
        <LabeledTool part={props.part} pendingLabel="Deleting transaction..." />
      </Match>
      {/* ── Analysis tools ── */}
      <Match when={props.part.tool === "analyze_expenses"}>
        <AnalyzeTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "check_alerts"}>
        <LabeledTool part={props.part} pendingLabel="Checking alerts..." />
      </Match>
      <Match when={props.part.tool === "get_net_worth"}>
        <LabeledTool part={props.part} pendingLabel="Calculating net worth..." />
      </Match>
      <Match when={props.part.tool === "get_price"}>
        <PriceTool part={props.part} />
      </Match>
      {/* ── List tools ── */}
      <Match when={props.part.tool === "list_accounts"}>
        <LabeledTool part={props.part} pendingLabel="Loading accounts..." />
      </Match>
      <Match when={props.part.tool === "list_debts"}>
        <LabeledTool part={props.part} pendingLabel="Loading debts..." />
      </Match>
      <Match when={props.part.tool === "list_budgets"}>
        <LabeledTool part={props.part} pendingLabel="Loading budgets..." />
      </Match>
      <Match when={props.part.tool === "list_goals"}>
        <LabeledTool part={props.part} pendingLabel="Loading goals..." />
      </Match>
      <Match when={props.part.tool === "list_transactions"}>
        <LabeledTool part={props.part} pendingLabel="Loading transactions..." />
      </Match>
      <Match when={props.part.tool === "list_portfolio"}>
        <LabeledTool part={props.part} pendingLabel="Loading portfolio..." />
      </Match>
      <Match when={props.part.tool === "list_recurring"}>
        <LabeledTool part={props.part} pendingLabel="Loading recurring..." />
      </Match>
      {/* ── Portfolio tools ── */}
      <Match when={props.part.tool === "add_position"}>
        <LabeledTool part={props.part} pendingLabel="Adding position..." />
      </Match>
      <Match when={props.part.tool === "update_position"}>
        <LabeledTool part={props.part} pendingLabel="Updating position..." />
      </Match>
      <Match when={props.part.tool === "close_position"}>
        <LabeledTool part={props.part} pendingLabel="Closing position..." />
      </Match>
      {/* ── Todo / Skill tools ── */}
      <Match when={props.part.tool === "todowrite" || props.part.tool === "todoread"}>
        <TodoTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "skill"}>
        <SkillTool part={props.part} />
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
      tool={props.part.tool}
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
      tool={props.part.tool}
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
      tool={props.part.tool}
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
      tool={props.part.tool}
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
      tool={props.part.tool}
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
          tool={props.part.tool}
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
      tool={props.part.tool}
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
          tool={props.part.tool}
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

// ── LabeledTool — generic tool with a custom pending label ─────────────────────
// While running: InlineTool spinner with the given label.
// When completed: BlockTool with collapsible output (same as GenericTool).

function LabeledTool(props: { part: Message.ToolPart; pendingLabel: string }) {
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
          tool={props.part.tool}
          pending={props.pendingLabel}
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

// ── TodoTool — visual task list for todowrite / todoread ───────────────────────

type TodoItem = { content: string; status: string; priority: string }

function TodoTool(props: { part: Message.ToolPart }) {
  const { theme } = useTheme()

  const todos = createMemo((): TodoItem[] => {
    const input = props.part.state.input as { todos?: TodoItem[] }
    return input.todos ?? []
  })

  const isRunning = () => props.part.state.status === "running"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  function statusIcon(status: string): string {
    if (status === "completed") return "✓"
    if (status === "in_progress") return "●"
    if (status === "cancelled") return "✗"
    return "○"
  }

  function todoFg(status: string, t: ReturnType<typeof theme>): RGBA {
    if (status === "completed") return t.textMuted
    if (status === "in_progress") return t.accent
    if (status === "cancelled") return t.textMuted
    return t.text
  }

  function priorityFg(priority: string, t: ReturnType<typeof theme>): RGBA {
    if (priority === "high") return t.accent
    return t.textMuted
  }

  return (
    <box paddingLeft={3} marginTop={0} flexDirection="column">
      {/* Header row — spinner while running, summary when done */}
      <Show
        when={isRunning()}
        fallback={
          <Show when={todos().length > 0}>
            <text>
              <span style={{ fg: isError() ? theme().error : theme().textMuted }}>
                {isError() ? "✗" : "✓"}
              </span>
              {"  "}
              <span style={{ fg: theme().textMuted }}>{"todowrite"}</span>
              {"  "}
              <span style={{ fg: isError() ? theme().error : theme().textMuted }}>
                {error() ?? title() ?? "tasks updated"}
              </span>
            </text>
          </Show>
        }
      >
        <Spinner color={theme().accent}>
          <span style={{ fg: theme().textMuted }}>{"todowrite"}</span>
          {"  "}
          <span style={{ fg: theme().textMuted }}>{"updating tasks..."}</span>
        </Spinner>
      </Show>

      {/* Todo rows — always visible once we have todos */}
      <Show when={todos().length > 0}>
        <box flexDirection="column" paddingLeft={3} marginTop={0}>
          <For each={todos()}>
            {(todo) => (
              <text>
                <span style={{ fg: todoFg(todo.status, theme()) }}>
                  {statusIcon(todo.status)}
                </span>
                {"  "}
                <span style={{ fg: todoFg(todo.status, theme()) }}>
                  {todo.content}
                </span>
                {"  "}
                <span style={{ fg: priorityFg(todo.priority, theme()) }}>
                  {todo.priority}
                </span>
              </text>
            )}
          </For>
        </box>
      </Show>
    </box>
  )
}

// ── SkillTool — shows which skill was loaded ────────────────────────────────────

function SkillTool(props: { part: Message.ToolPart }) {
  const inp = () => props.part.state.input as { name?: string }
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  return (
    <InlineTool
      tool="skill"
      pending={`Loading skill: ${inp().name ?? ""}...`}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
    >
      {title() ?? `skill: ${inp().name ?? ""}`}
    </InlineTool>
  )
}

function InlineTool(props: {
  tool: string
  pending: string
  complete: boolean
  running: boolean
  error: string | undefined
  children: any
}) {
  const { theme } = useTheme()

  return (
    <box paddingLeft={3} marginTop={0}>
      <Show
        when={props.running}
        fallback={
          <Show
            when={props.complete || !!props.error}
            fallback={<text fg={theme().textMuted}>· {props.pending}</text>}
          >
            <text>
              <span style={{ fg: props.error ? theme().error : theme().textMuted }}>
                {props.error ? "✗" : "✓"}
              </span>
              {"  "}
              <span style={{ fg: theme().textMuted }}>{props.tool}</span>
              {"  "}
              <span style={{ fg: props.error ? theme().error : theme().textMuted }}>
                {props.children}
              </span>
            </text>
          </Show>
        }
      >
        <Spinner color={theme().accent}>
          <span style={{ fg: theme().textMuted }}>{props.tool}</span>
          {"  "}
          {props.children}
        </Spinner>
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

  return (
    <box
      border={["left"]}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={2}
      marginTop={1}
      gap={1}
      customBorderChars={SplitBorder.customBorderChars}
      borderColor={theme().border}
      onMouseUp={() => props.onClick?.()}
    >
      <Show
        when={props.running}
        fallback={
          <text fg={theme().textMuted}>{props.title}</text>
        }
      >
        <Spinner color={theme().accent}>{props.title}</Spinner>
      </Show>
      {props.children}
      <Show when={props.error}>
        <text fg={theme().error}>{props.error}</text>
      </Show>
    </box>
  )
}
