import { Match, Switch, onMount } from "solid-js"
import { useRoute, RouteProvider } from "./context/route"
import { ExitProvider, useExit } from "./context/exit"
import { KVProvider } from "./context/kv"
import { ThemeProvider, useTheme } from "./context/theme"
import { SDKProvider, api } from "./context/sdk"
import { SyncProvider, useSync } from "./context/sync"
import { ToastProvider, ToastList, useToast } from "./ui/toast"
import { DialogProvider, DialogOverlay, useDialog } from "./ui/dialog"
import { DialogSelect } from "./ui/dialog-select"
import { DialogPrompt } from "./ui/dialog-prompt"
import { DialogOutput } from "./ui/dialog-output"
import { CommandProvider, useCommandRegistry, useCommandPalette } from "./component/command"
import { PromptHistoryProvider } from "./context/prompt-history"
import { ModelsProvider } from "./context/models"
import { DialogModel } from "./component/dialog-model"
import { HomeRoute } from "./routes/home"
import { SessionRoute } from "./routes/session/index"
import { DashboardRoute } from "./routes/dashboard"

// ── Router ────────────────────────────────────────────────────────────────────

function Router() {
  const route = useRoute()
  const current = () => route.data

  return (
    <Switch>
      <Match when={current().type === "home"}>
        <HomeRoute />
      </Match>
      <Match when={current().type === "session"}>
        <SessionRoute
          sessionID={(current() as { type: "session"; sessionID: string }).sessionID}
          initialPrompt={(current() as { type: "session"; initialPrompt?: string }).initialPrompt}
        />
      </Match>
      <Match when={current().type === "dashboard"}>
        <DashboardRoute />
      </Match>
    </Switch>
  )
}

// ── Commands registration ─────────────────────────────────────────────────────

function Commands() {
  const registry = useCommandRegistry()
  const { show: showPalette } = useCommandPalette()
  const route = useRoute()
  const sync = useSync()
  const { exit } = useExit()
  const dialog = useDialog()
  const themeCtx = useTheme()
  const toast = useToast()

  async function newSession(title?: string, initialPrompt?: string) {
    try {
      const session = await sync.createSession(title)
      route.navigate({ type: "session", sessionID: session.id, initialPrompt })
    } catch (err) {
      toast.show(`Failed to create session: ${err instanceof Error ? err.message : String(err)}`, "error")
    }
  }

  function showSessionList() {
    const sessions = sync.store.sessions
    if (!sessions.length) {
      newSession()
      return
    }
    dialog.replace({
      component: () => (
        <DialogSelect
          title="Sessions"
          items={sessions.map((s) => ({
            label: s.title,
            description: new Date(s.time.updated).toLocaleDateString("en-US"),
            onSelect: () => route.navigate({ type: "session", sessionID: s.id }),
          }))}
        />
      ),
    })
  }

  function showCmdResult(title: string, output: string) {
    const plain = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    const lines = plain.split("\n")
    dialog.replace({
      component: () => <DialogOutput title={title} lines={lines} />,
    })
  }

  function runCmd(command: string, args: string[] = []) {
    api.runCmd(command, args).then((output) => showCmdResult(command, output)).catch((err) => {
      toast.show(err instanceof Error ? err.message : String(err), "error")
    })
  }

  onMount(() => {
    registry.register({
      id: "new",
      title: "New Session",
      description: "Start a new conversation",
      slash: "new",
      category: "Navigation",
      action: () => newSession(),
    })

    registry.register({
      id: "sessions",
      title: "Sessions",
      description: "Browse conversation history",
      slash: "sessions",
      category: "Navigation",
      action: showSessionList,
    })

    registry.register({
      id: "home",
      title: "Go Home",
      description: "Return to the home screen",
      slash: "home",
      category: "Navigation",
      action: () => route.navigate({ type: "home" }),
    })

    registry.register({
      id: "help",
      title: "Help",
      description: "Show available commands",
      slash: "help",
      category: "General",
      action: showPalette,
    })

    registry.register({
      id: "exit",
      title: "Exit",
      description: "Quit OpenFin",
      slash: "exit",
      category: "General",
      action: () => exit("Goodbye from OpenFin!"),
    })

    registry.register({
      id: "dashboard",
      title: "Dashboard",
      description: "Full-screen financial overview",
      slash: "dashboard",
      category: "Finance",
      action: () => route.navigate({ type: "dashboard" }),
    })

    registry.register({
      id: "accounts",
      title: "Accounts",
      description: "View your accounts",
      slash: "accounts",
      category: "Finance",
      action: () => runCmd("accounts"),
    })

    registry.register({
      id: "budgets",
      title: "Budgets",
      description: "Review spending budgets",
      slash: "budgets",
      category: "Finance",
      action: () => runCmd("budgets"),
    })

    registry.register({
      id: "goals",
      title: "Financial Goals",
      description: "Track your goals",
      slash: "goals",
      category: "Finance",
      action: () => runCmd("goals"),
    })

    registry.register({
      id: "debts",
      title: "Debts",
      description: "View your debts",
      slash: "debts",
      category: "Finance",
      action: () => runCmd("debts"),
    })

    registry.register({
      id: "expenses",
      title: "Expenses",
      description: "Analyze spending this month",
      slash: "expenses",
      category: "Finance",
      action: () => runCmd("spending"),
    })

    registry.register({
      id: "networth",
      title: "Net Worth",
      description: "Net worth summary",
      slash: "networth",
      category: "Finance",
      action: () => runCmd("networth"),
    })

    registry.register({
      id: "recurring",
      title: "Recurring",
      description: "View recurring transactions",
      slash: "recurring",
      category: "Finance",
      action: () => runCmd("recurring"),
    })

    registry.register({
      id: "alerts",
      title: "Alerts",
      description: "View active financial alerts",
      slash: "alerts",
      category: "Finance",
      action: () => runCmd("alerts"),
    })

    registry.register({
      id: "txs",
      title: "Transactions",
      description: "List recent transactions",
      slash: "txs",
      category: "Finance",
      action: () => runCmd("txs"),
    })

    registry.register({
      id: "model",
      title: "Change Model",
      description: "Select the AI model to use",
      slash: "model",
      category: "Settings",
      action: () => dialog.replace({ component: () => <DialogModel /> }),
    })

    registry.register({
      id: "theme",
      title: "Change Theme",
      description: "Select a color theme",
      slash: "theme",
      category: "Settings",
      action: () => {
        const themes = themeCtx.all()
        const originalTheme = themeCtx.selected
        dialog.replace({
          component: () => (
            <DialogSelect
              title="Select Theme"
              items={Object.keys(themes).sort().map((name) => ({
                label: name,
                description: name === themeCtx.selected ? "current" : undefined,
                onSelect: () => {
                  themeCtx.set(name)
                  dialog.clear()
                },
              }))}
            />
          ),
        })
      },
    })

    registry.register({
      id: "rename",
      title: "Rename Session",
      description: "Rename the current session",
      slash: "rename",
      category: "Session",
      action: () => {
        if (route.data.type !== "session") return
        const sessionID = (route.data as { type: "session"; sessionID: string }).sessionID
        const session = sync.store.sessions.find((s) => s.id === sessionID)
        dialog.replace({
          component: () => (
            <DialogPrompt
              title="Rename Session"
              placeholder="Session title"
              value={session?.title}
              onConfirm={(title) => {
                if (title.trim()) sync.renameSession(sessionID, title.trim())
              }}
            />
          ),
        })
      },
    })
  })

  return null
}

// ── App core (inside all providers) ──────────────────────────────────────────

function AppCore() {
  return (
    <>
      <Commands />
      <Router />
      <DialogOverlay />
      <ToastList />
    </>
  )
}

// ── Root App ──────────────────────────────────────────────────────────────────

export function App() {
  return (
    <KVProvider>
      <ThemeProvider>
        <ExitProvider>
          <RouteProvider>
            <SDKProvider>
              <SyncProvider>
                <ModelsProvider>
                <ToastProvider>
                  <DialogProvider>
                    <CommandProvider>
                      <PromptHistoryProvider>
                        <AppCore />
                      </PromptHistoryProvider>
                    </CommandProvider>
                  </DialogProvider>
                </ToastProvider>
                </ModelsProvider>
              </SyncProvider>
            </SDKProvider>
          </RouteProvider>
        </ExitProvider>
      </ThemeProvider>
    </KVProvider>
  )
}
