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

  case "auth":
    await import("./cli/auth")
    break

  case "server":
  case undefined:
    await startServer()
    break

  default:
    console.error(`Unknown subcommand: ${subcommand}`)
    console.error(`Usage: openfin [server|tui|chat|telegram|auth]`)
    process.exit(1)
}

async function startServer() {
  const { Server } = await import("./server/server")
  const { ToolRegistry } = await import("./tool/registry")
  const { GetPriceTool } = await import("./tool/get-price")
  const { ProfileTools } = await import("./tool/profile-tools")
  const { PortfolioTools } = await import("./tool/portfolio-tools")
  const { SkillTool } = await import("./tool/skill")
  const { TodoWriteTool, TodoReadTool } = await import("./tool/todo")
  const { PurchaseAdvisorTool } = await import("./tool/purchase-advisor")
  const { Profile } = await import("./profile/profile")
  const { Bus } = await import("./bus/index")

  ToolRegistry.register(GetPriceTool, SkillTool, TodoWriteTool, TodoReadTool, PurchaseAdvisorTool, ...ProfileTools, ...PortfolioTools)

  function runDailyScheduler() {
    // Net worth snapshot
    try {
      Profile.takeNetWorthSnapshot()
    } catch {
      // Non-fatal
    }

    // Recurring transactions
    try {
      const logged = Profile.processDueRecurring()
      if (logged.length > 0) {
        console.log(`[scheduler] Logged ${logged.length} recurring transaction(s)`)
        Bus.publish(Bus.RecurringAutoLogged, {
          items: logged.map((r) => ({
            title: r.title,
            amount: r.amount,
            type: r.type,
            category: r.category,
            currency: r.currency,
          })),
        }).catch(() => {})
      }
    } catch (err) {
      console.error("[scheduler] Error processing recurring transactions:", err)
    }
  }

  runDailyScheduler()
  setInterval(runDailyScheduler, 24 * 60 * 60 * 1000)

  Server.listen()
}
