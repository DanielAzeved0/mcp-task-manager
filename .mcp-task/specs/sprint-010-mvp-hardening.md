# SPEC - SPRINT-010 MVP Hardening

## Goal

Harden the local MVP of MCP Harness Task Manager so the core workflow is reliable, documented and verifiable end to end.

## Scope

- Validate MVP readiness with deterministic local checks.
- Confirm workspace, pipeline, artifacts, UI, CLI, validation, documentation, security and offline behavior.
- Improve documentation around local MVP usage and limitations.
- Record MVP readiness report and remaining risks.
- Preserve offline-first and file-backed architecture.

## Out of Scope

- New major product features.
- SaaS, auth, billing, teams or cloud sync.
- Database, vector database or embeddings.
- Publishing to npm.
- Desktop packaging.
- Automatic command execution.
- Broad runtime rewrite.

## Requirements

- MVP readiness requires score >= 90.
- No required check can fail when status is ready.
- README must document local MVP usage, CLI, validation and limitations.
- CLI status, doctor and help must work after build.
- Existing validation commands must pass.
- Execution harness must remain explicit and user-controlled.

## Acceptance Criteria

- MVP readiness report exists and validates.
- `.mcp-task/docs/mvp-readiness.md` exists.
- README reflects MCP Harness Task Manager and `mcp-task`.
- `node --check public/app.js` passes.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.
- Built CLI `status`, `doctor` and `--help` pass.
