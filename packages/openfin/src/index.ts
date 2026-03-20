const subcommand = process.argv[2]

switch (subcommand) {
  case "tui":
    await import("./tui/index")
    break

  case "chat":
    await import("./cli/index")
    break

  case "telegram":
    await import("./telegram/index")
    break

  case "server":
  case undefined:
    await startServer()
    break

  default:
    console.error(`Unknown subcommand: ${subcommand}`)
    console.error(`Usage: openfin [server|tui|chat|telegram]`)
    process.exit(1)
}

async function startServer() {
  const { Server } = await import("./server/server")
  const { ToolRegistry } = await import("./tool/registry")
  const { GetPriceTool } = await import("./tool/get-price")
  const { ProfileTools } = await import("./tool/profile-tools")
  const { PortfolioTools } = await import("./tool/portfolio-tools")
  const { SkillTool } = await import("./tool/skill")
  const { Profile } = await import("./profile/profile")

  ToolRegistry.register(GetPriceTool, SkillTool, ...ProfileTools, ...PortfolioTools)

  try {
    Profile.takeNetWorthSnapshot()
  } catch {
    // Non-fatal — snapshot is best-effort
  }

  function runRecurringScheduler() {
    try {
      const count = Profile.processDueRecurring()
      if (count > 0) console.log(`[scheduler] Logged ${count} recurring transaction(s)`)
    } catch (err) {
      console.error("[scheduler] Error processing recurring transactions:", err)
    }
  }

  runRecurringScheduler()
  setInterval(runRecurringScheduler, 24 * 60 * 60 * 1000)

  Server.listen()
}
