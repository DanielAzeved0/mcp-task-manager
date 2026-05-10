import net from "net";
import { logEvent } from "../observability/logger.js";

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once("error", () => {
        server.close(() => resolve(false));
      })
      .once("listening", () => {
        server.close(() => resolve(true));
      })
      .listen(port, "0.0.0.0");
  });
}

export async function findAvailablePort(startPort: number, fallbackList: number[]) {
  const attempts: number[] = [];
  const errors: string[] = [];
  const triedPorts = new Set<number>();
  const maxScan = 1000;
  const candidates = [startPort, ...fallbackList.filter((port) => port !== startPort)];

  for (let offset = 1; offset <= maxScan; offset += 1) {
    candidates.push(startPort + offset);
  }

  for (const candidate of candidates) {
    if (triedPorts.has(candidate)) continue;
    triedPorts.add(candidate);
    attempts.push(candidate);
    logEvent("debug", "port_check_started", { port: candidate });

    try {
      const available = await isPortAvailable(candidate);
      if (available) {
        logEvent("info", "port_selected", { port: candidate });
        return { selectedPort: candidate, attempts, errors };
      }
      errors.push(`Port ${candidate} unavailable`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Port ${candidate} check failed: ${message}`);
    }
  }

  throw new Error(`No available ports found. Tried: ${attempts.join(", ")}`);
}
