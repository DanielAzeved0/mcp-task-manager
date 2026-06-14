# Sprint SPRINT-009 - Packaging and CLI Foundation

## Goal

Prepare the project to become an installable npm tool without changing the local-first product model.

## Status

`passed`

## Scope

- Package naming cleanup.
- CLI entrypoint plan.
- Local project initialization command.
- Build/start documentation.
- Minimal installable structure.

## Tasks

- [x] Decide package name and binary name.
- [x] Add CLI command plan for `mcp-task start`.
- [x] Add CLI command plan for `mcp-task status`.
- [x] Add CLI command plan for `mcp-task doctor`.
- [x] Ensure build output supports backend start.
- [x] Document local setup and usage.
- [x] Avoid publishing automation until explicitly requested.

## Acceptance Criteria

- Package metadata aligns with MCP Harness Task Manager.
- CLI design is documented and minimally scaffolded.
- Local initialization can create `.mcp-task/` structure.
- Existing backend and frontend remain runnable locally.
- No SaaS deployment path is required.

## Expected Contract Focus

The contract must prevent premature publishing, cloud deployment or package registry automation.

## Validation

- `node --check public/app.js` passed.
- `npm.cmd run build` passed.
- `npm.cmd run test:golden` passed.
- `node dist/cli/mcp-task.js --help` passed.
- `node dist/cli/mcp-task.js doctor` passed.
- `node dist/cli/mcp-task.js status` passed.
- Golden coverage validates CLI parsing, status formatting, doctor formatting and package metadata.
