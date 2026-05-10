import path from "path";
import fs from "fs/promises";
import { logEvent } from "../observability/logger.js";

export interface BackendConfigFile {
  active_port: number;
  health_endpoint: string;
  server_status: string;
  connection_status: string;
  port_attempts: number[];
  selected_port: number;
  startup_errors: string[];
}

const backendConfigPath = path.resolve(process.cwd(), "public", "backend-config.json");

export async function writeBackendConfig(config: BackendConfigFile) {
  try {
    await fs.writeFile(backendConfigPath, JSON.stringify(config, null, 2), "utf-8");
    logEvent("info", "backend_config_written", { path: backendConfigPath });
  } catch (error) {
    logEvent("warn", "backend_config_write_failed", { reason: error instanceof Error ? error.message : String(error) });
  }
}
