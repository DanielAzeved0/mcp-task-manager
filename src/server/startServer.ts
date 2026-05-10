import type { Express } from "express";
import { logEvent } from "../observability/logger.js";
import { setActivePort } from "../runtime/serverRuntimeState.js";
import { writeBackendConfig } from "./backendConfig.js";
import { fallbackPorts, preferredPort } from "./serverConfig.js";
import { findAvailablePort } from "./portManager.js";

export async function startServer(app: Express) {
  const startup = {
    port_attempts: [] as number[],
    selected_port: null as number | null,
    startup_errors: [] as string[],
  };

  try {
    const { selectedPort, attempts, errors } = await findAvailablePort(preferredPort, fallbackPorts);
    startup.port_attempts = attempts;
    startup.selected_port = selectedPort;
    startup.startup_errors = errors;
    setActivePort(selectedPort);

    await writeBackendConfig({
      active_port: selectedPort,
      health_endpoint: "/health",
      server_status: "running",
      connection_status: "connected",
      port_attempts: attempts,
      selected_port: selectedPort,
      startup_errors: errors,
    });

    app.listen(selectedPort, () => {
      logEvent("info", "server_listening", {
        url: `http://localhost:${selectedPort}`,
        port_attempts: startup.port_attempts,
        selected_port: startup.selected_port,
        startup_errors: startup.startup_errors,
      });
    });
  } catch (error) {
    startup.startup_errors.push(error instanceof Error ? error.message : String(error));
    logEvent("error", "server_start_failed", { startup_errors: startup.startup_errors });
    process.exit(1);
  }
}
