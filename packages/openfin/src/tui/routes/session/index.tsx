import { createEffect, createMemo, createSignal, Match, on, Show, Switch } from "solid-js"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { useRoute } from "../../context/route"
import { useSync } from "../../context/sync"
import { useKV } from "../../context/kv"
import { useModel } from "../../component/dialog-model"
import { SessionHeader } from "./header"
import { MessageList } from "./messages"
import { SessionInput } from "./input"
import { Sidebar } from "./sidebar"
import { Footer } from "./footer"

interface SessionRouteProps {
  sessionID: string
  initialPrompt?: string
}

export function SessionRoute(props: SessionRouteProps) {
  const dims = useTerminalDimensions()
  const route = useRoute()
  const sync = useSync()
  const kv = useKV()

  const [selectedModel] = useModel()
  const [sidebarPref, setSidebarPref] = kv.signal<"auto" | "hide">("sidebar", "auto")
  const [sidebarOpen, setSidebarOpen] = createSignal(false)

  const wide = createMemo(() => dims().width > 120)
  const sidebarVisible = createMemo(() => {
    if (sidebarOpen()) return true
    if (sidebarPref() === "auto" && wide()) return true
    return false
  })

  createEffect(on(() => props.sessionID, (id) => {
    if (props.initialPrompt) {
      sync.sendMessage(id, props.initialPrompt, selectedModel())
    } else {
      sync.loadMessages(id)
    }
  }))

  useKeyboard((key) => {
    if (key.ctrl && key.name === "b") {
      route.navigate({ type: "home" })
      return true
    }
    if (key.ctrl && key.name === "s") {
      if (sidebarVisible()) {
        setSidebarPref("hide")
        setSidebarOpen(false)
      } else {
        setSidebarPref("auto")
        setSidebarOpen(true)
      }
      return true
    }
    return false
  })

  return (
    <box flexDirection="column" height={dims().height}>
      <box flexDirection="row" flexGrow={1} overflow="hidden">
        {/* Main column */}
        <box flexGrow={1} flexDirection="column" paddingBottom={1} paddingTop={1} paddingLeft={2} paddingRight={2} gap={1}>
          {/* Header — hidden when sidebar is visible on wide terminal */}
          <Show when={!sidebarVisible() || !wide()}>
            <box flexShrink={0}>
              <SessionHeader sessionID={props.sessionID} />
            </box>
          </Show>

          {/* Messages */}
          <box flexGrow={1}>
            <MessageList sessionID={props.sessionID} />
          </box>

          {/* Input */}
          <box flexShrink={0}>
            <SessionInput sessionID={props.sessionID} />
          </box>
        </box>

        {/* Sidebar */}
        <Show when={sidebarVisible()}>
          <Switch>
            <Match when={wide()}>
              <Sidebar sessionID={props.sessionID} />
            </Match>
            <Match when={!wide()}>
              <box
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                alignItems="flex-end"
                backgroundColor={RGBA.fromInts(0, 0, 0, 70)}
              >
                <Sidebar sessionID={props.sessionID} overlay={true} />
              </box>
            </Match>
          </Switch>
        </Show>
      </box>

      {/* Footer */}
      <Footer />
    </box>
  )
}
