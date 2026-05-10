import "dotenv/config";
import { logEvent } from "./observability/logger.js";
import { createApp } from "./server/app.js";
import { startServer } from "./server/startServer.js";

logEvent("info", "server_starting", { service: "MCP Prompt Spec API" });

const app = createApp();

startServer(app);
