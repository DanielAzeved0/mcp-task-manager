let activePort: number | null = null;

export function setActivePort(port: number | null) {
  activePort = port;
}

export function getActivePort() {
  return activePort;
}
