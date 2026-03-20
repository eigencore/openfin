import { Server } from "./server/server"
import { ToolRegistry } from "./tool/registry"
import { GetPriceTool } from "./tool/get-price"
import { ProfileTools } from "./tool/profile-tools"
import { PortfolioTools } from "./tool/portfolio-tools"
import { SkillTool } from "./tool/skill"
import { Profile } from "./profile/profile"

// Register all tools before starting the server
ToolRegistry.register(GetPriceTool, SkillTool, ...ProfileTools, ...PortfolioTools)

// Take a daily net worth snapshot on startup (upserts if already taken today)
try {
  Profile.takeNetWorthSnapshot()
} catch {
  // Non-fatal — snapshot is best-effort
}

// Process due recurring transactions on startup, then every 24h
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
