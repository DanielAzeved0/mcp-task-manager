# SPEC - SPRINT-009 Packaging and CLI Foundation

## Goal

Prepare MCP Harness Task Manager to evolve into a local npm-installable tool by adding package metadata and a minimal CLI foundation.

## Scope

- Align package metadata with `mcp-task`.
- Add local `bin` entry for `mcp-task`.
- Implement CLI commands `start`, `status`, `doctor`, `help` and `version`.
- Keep CLI commands local, offline-first and non-destructive.
- Document local CLI usage.
- Validate command parsing, status summary and doctor checks.

## Out of Scope

- Publishing to npm.
- Release automation.
- CI/CD.
- Native binaries or desktop installers.
- Electron/Tauri packaging.
- SaaS, auth, billing, team workspaces or cloud sync.
- New dependencies.

## Requirements

- `mcp-task status` must read `.mcp-task/` without requiring the HTTP server.
- `mcp-task doctor` must validate local prerequisites without requiring network.
- `mcp-task start` may reuse the existing server startup.
- Existing scripts must be preserved.
- Errors must be controlled and terminal-friendly.

## Acceptance Criteria

- `package.json` exposes `bin.mcp-task`.
- CLI command parsing is deterministic.
- `status` summarizes current sprint, gates, memory and tool commands.
- `doctor` validates package metadata, workspace and essential scripts.
- Unknown commands return a controlled usage error.
- `node --check public/app.js` passes.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.
- `node dist/cli/mcp-task.js status`, `doctor` and `--help` run after build.
