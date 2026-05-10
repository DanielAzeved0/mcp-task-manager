export const preferredPort = Number(process.env.PORT) || Number(process.env.PREFERRED_PORT) || 3000;

export const fallbackPorts = process.env.FALLBACK_PORTS
  ? process.env.FALLBACK_PORTS.split(",").map((port) => Number(port.trim())).filter(Boolean)
  : [];
