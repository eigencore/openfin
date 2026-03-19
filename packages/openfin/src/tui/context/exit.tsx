import { useRenderer } from "@opentui/solid"
import { createSimpleContext } from "./helper"

const ExitContext = createSimpleContext({
  name: "Exit",
  init: () => {
    const renderer = useRenderer()

    function exit(message?: string) {
      renderer.destroy()
      if (message) process.stdout.write(message + "\n")
      process.exit(0)
    }

    return { exit }
  },
})

export const ExitProvider = ExitContext.provider
export const useExit = ExitContext.use
