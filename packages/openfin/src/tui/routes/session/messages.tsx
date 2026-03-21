import { createEffect, createMemo, For, Show, Switch, Match } from "solid-js"
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
    const toolParts = all.filter((p): p is Message.ToolPart => p.type === "tool")
    // Deduplicate by id, then for stateful tools keep only last invocation
    const seen = new Map<string, Message.ToolPart>()
    for (const p of toolParts) seen.set(p.id, p)
    const deduped = Array.from(seen.values())
    const STATEFUL_TOOLS = new Set(["todowrite", "todoread"])
    const lastStateful = new Map<string, Message.ToolPart>()
    for (const p of deduped) {
      if (STATEFUL_TOOLS.has(p.tool)) lastStateful.set(p.tool, p)
    }
    return deduped.filter((p) => !STATEFUL_TOOLS.has(p.tool) || lastStateful.get(p.tool) === p)
  })

  return (
    <box marginTop={1} flexShrink={0}>
      {/* Tool parts first */}
      <For each={parts()}>
        {(part) => <ToolPartRow part={part} />}
      </For>
      {/* Text content below tools */}
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

// Stable sentinel placed at the end of the display list so the text box is
// always the last item rendered by <For>. Its reference never changes so
// SolidJS will never remount the component even when tool parts are inserted
// before it — guaranteeing text is always below tools in the DOM.
const STREAMING_TEXT_ENTRY = { id: "__streaming_text" as const }

function StreamingAssistantBubble(props: { sessionID: string; syntax: SyntaxStyle }) {
  const { theme } = useTheme()
  const sync = useSync()

  // Fine-grained read — only this memo reruns on each text-delta
  const content = createMemo(() => sync.store.streaming[props.sessionID]?.content ?? "")

  // IDs of already-committed messages — their tool parts are rendered by AssistantBubble
  const committedIDs = createMemo(() => {
    const msgs = sync.store.messages[props.sessionID] ?? []
    return new Set(msgs.map((m) => m.id))
  })

  // Collect tool parts only from the active (non-committed) streaming turn
  const sessionToolParts = createMemo(() => {
    const allParts = sync.store.parts
    const committed = committedIDs()
    const result: Message.ToolPart[] = []
    for (const [msgID, msgParts] of Object.entries(allParts)) {
      if (committed.has(msgID)) continue
      for (const p of msgParts) {
        if (p.type === "tool" && p.sessionID === props.sessionID) result.push(p)
      }
    }
    const seen = new Map<string, Message.ToolPart>()
    for (const p of result) seen.set(p.id, p)
    const parts = Array.from(seen.values())
    const STATEFUL_TOOLS = new Set(["todowrite", "todoread"])
    const lastStateful = new Map<string, Message.ToolPart>()
    for (const p of parts) {
      if (STATEFUL_TOOLS.has(p.tool)) lastStateful.set(p.tool, p)
    }
    const deduped: Message.ToolPart[] = []
    for (const p of parts) {
      if (!STATEFUL_TOOLS.has(p.tool) || lastStateful.get(p.tool) === p) deduped.push(p)
    }
    return deduped
  })

  // Single ordered list: tool parts first, text sentinel always last.
  // displayItems only changes when tools arrive (not on every text-delta),
  // so <For> never remounts the text component during streaming.
  const displayItems = createMemo(
    (): (Message.ToolPart | typeof STREAMING_TEXT_ENTRY)[] => [...sessionToolParts(), STREAMING_TEXT_ENTRY],
  )

  return (
    <box marginTop={1} flexShrink={0}>
      <Show when={sessionToolParts().length === 0 && !content()}>
        <box paddingLeft={3}>
          <Spinner>Thinking...</Spinner>
        </box>
      </Show>
      <For each={displayItems()}>
        {(item) => {
          if (item.id === "__streaming_text") {
            // content() updates reactively inside without causing <For> to remount
            return (
              <box paddingLeft={3}>
                <Show when={content()}>
                  <code
                    filetype="markdown"
                    drawUnstyledText={false}
                    streaming={true}
                    syntaxStyle={props.syntax}
                    content={content().trim()}
                    fg={theme().text}
                  />
                </Show>
              </box>
            )
          }
          return <ToolPartRow part={item as Message.ToolPart} />
        }}
      </For>
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
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "contribute_to_goal"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "transfer_between_accounts"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "delete_account"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "delete_debt"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "delete_budget"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "delete_goal"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "delete_transaction"}>
        <LabeledTool part={props.part} />
      </Match>
      {/* ── Analysis tools ── */}
      <Match when={props.part.tool === "analyze_expenses"}>
        <AnalyzeTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "check_alerts"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "get_net_worth"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "get_price"}>
        <PriceTool part={props.part} />
      </Match>
      {/* ── List tools ── */}
      <Match when={props.part.tool === "list_accounts"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "list_debts"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "list_budgets"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "list_goals"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "list_transactions"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "list_portfolio"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "list_recurring"}>
        <LabeledTool part={props.part} />
      </Match>
      {/* ── Portfolio tools ── */}
      <Match when={props.part.tool === "add_position"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "update_position"}>
        <LabeledTool part={props.part} />
      </Match>
      <Match when={props.part.tool === "close_position"}>
        <LabeledTool part={props.part} />
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

// ── TreeTool — base visual primitive (replaces InlineTool) ─────────────────────
// States:
//   queued  →  ·  tool(args)          (dimmed, waiting to run)
//   running →  ⠋  tool(args)          (spinner)
//   done    →  ●  tool(args)          (success dot + result on next line)
//   error   →  ✗  tool(args)          (error + message on next line)

function TreeTool(props: {
  tool: string
  args?: string
  running: boolean
  complete: boolean
  error?: string
  result?: string
}) {
  const { theme } = useTheme()

  return (
    <box paddingLeft={3} marginTop={0} flexDirection="column">
      <Show
        when={props.running}
        fallback={
          <Show
            when={props.complete || !!props.error}
            fallback={
              // queued state
              <text>
                <span style={{ fg: theme().textMuted }}>{"·  "}</span>
                <span style={{ fg: theme().textMuted }}>{props.tool}</span>
                <Show when={props.args}>
                  <span style={{ fg: theme().textMuted }}>{props.args}</span>
                </Show>
              </text>
            }
          >
            {/* complete or error */}
            <text>
              <span style={{ fg: props.error ? theme().error : theme().success }}>
                {props.error ? "✗" : "●"}
              </span>
              {"  "}
              <span style={{ fg: theme().text }}>{props.tool}</span>
              <Show when={props.args}>
                <span style={{ fg: theme().textMuted }}>{props.args}</span>
              </Show>
            </text>
            <Show when={props.result || props.error}>
              <text>
                <span style={{ fg: theme().textMuted }}>{"   └ "}</span>
                <span style={{ fg: props.error ? theme().error : theme().textMuted }}>
                  {props.error ?? props.result}
                </span>
              </text>
            </Show>
          </Show>
        }
      >
        {/* running */}
        <Spinner color={theme().accent}>
          <span style={{ fg: theme().textMuted }}>{props.tool}</span>
          <Show when={props.args}>
            <span style={{ fg: theme().textMuted }}>{props.args}</span>
          </Show>
        </Spinner>
      </Show>
    </box>
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
    <TreeTool
      tool={props.part.tool}
      args={inp().name ? `(${inp().name})` : undefined}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
      result={title() ?? (inp().name ? `account saved` : undefined)}
    />
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
    <TreeTool
      tool={props.part.tool}
      args={inp().name ? `(${inp().name})` : undefined}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
      result={title() ?? `debt saved`}
    />
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
    <TreeTool
      tool={props.part.tool}
      args={inp().category ? `(${inp().category})` : undefined}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
      result={title() ?? `budget saved`}
    />
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
    <TreeTool
      tool={props.part.tool}
      args={inp().name ? `(${inp().name})` : undefined}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
      result={title() ?? `goal saved`}
    />
  )
}

function TransactionTool(props: { part: Message.ToolPart }) {
  const inp = () => props.part.state.input as { type?: string; amount?: number; category?: string; description?: string }
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  const args = () => {
    const i = inp()
    const dir = i.type === "income" ? "income" : "expense"
    const amount = i.amount != null ? ` $${i.amount}` : ""
    return `(${dir}${amount})`
  }

  return (
    <TreeTool
      tool={props.part.tool}
      args={args()}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
      result={title() ?? inp().description ?? `transaction logged`}
    />
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
    <TreeTool
      tool={props.part.tool}
      args={inp().symbol ? `(${inp().symbol})` : undefined}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
      result={title()}
    />
  )
}

// ── AnalyzeTool — compact tree row ─────────────────────────────────────────────

function AnalyzeTool(props: { part: Message.ToolPart }) {
  const inp = () => props.part.state.input as { period?: string }
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  return (
    <TreeTool
      tool={props.part.tool}
      args={inp().period ? `(${inp().period})` : undefined}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
      result={title()}
    />
  )
}

// ── GenericTool — fallback for unrecognized tools ──────────────────────────────

function GenericTool(props: { part: Message.ToolPart }) {
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  return (
    <TreeTool
      tool={props.part.tool}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
      result={title()}
    />
  )
}

// ── LabeledTool — compact tree row ─────────────────────────────────────────────

function LabeledTool(props: { part: Message.ToolPart }) {
  const isRunning = () => props.part.state.status === "running"
  const isCompleted = () => props.part.state.status === "completed"
  const isError = () => props.part.state.status === "error"
  const title = () => (props.part.state.status === "completed" ? props.part.state.title : undefined)
  const error = () => (props.part.state.status === "error" ? props.part.state.error : undefined)

  return (
    <TreeTool
      tool={props.part.tool}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
      result={title()}
    />
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
              <span style={{ fg: isError() ? theme().error : theme().success }}>
                {isError() ? "✗" : "●"}
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
        </Spinner>
      </Show>

      {/* Todo rows — always visible once we have todos */}
      <Show when={todos().length > 0}>
        <box flexDirection="column" paddingLeft={5} marginTop={0}>
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
    <TreeTool
      tool="skill"
      args={inp().name ? `(${inp().name})` : undefined}
      running={isRunning()}
      complete={isCompleted() || isError()}
      error={error()}
      result={title()}
    />
  )
}
