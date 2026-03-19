import { Server } from "./server/server"
import { ToolRegistry } from "./tool/registry"
import { GetPriceTool } from "./tool/get-price"
import { ProfileTools } from "./tool/profile-tools"

// Register all tools before starting the server
ToolRegistry.register(GetPriceTool, ...ProfileTools)

Server.listen()
