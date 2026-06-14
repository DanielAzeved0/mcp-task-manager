# Sprint SPRINT-002 - File-Backed Workspace Runtime

## Goal

Replace static seeded UI state with a local file-backed workspace runtime that reads `.mcp-task/` artifacts through the existing backend.

## Status

`passed`

## Scope

- Add backend read endpoints for `.mcp-task/` workspace metadata.
- Load SPEC, sprint, contract, evaluation, memory and logs from local files.
- Show loading, empty and error states in the IDE shell.
- Keep all persistence local to the repository.

## Tasks

- [x] Define workspace artifact types.
- [x] Add safe file-system reader under `src/infra/file-system/`.
- [x] Add route for workspace summary.
- [x] Add route for reading selected artifact content.
- [x] Update frontend to fetch local workspace state.
- [x] Preserve offline behavior when backend is running locally.
- [x] Add focused tests for file path boundaries.
- [x] Create Contract and Evaluation for this sprint before implementation is marked Done.

## Validation

- `npm.cmd run build` passed.
- `npm.cmd run test:golden` passed.
- Manual endpoint check: `GET /workspace` returned `200`.
- Manual security check: `GET /workspace/artifact?path=../AGENTS.md` returned `400`.

## Acceptance Criteria

- UI no longer depends on hardcoded sprint document content.
- App can read existing `.mcp-task/` files.
- Missing folders/files produce useful empty states.
- Backend prevents path traversal outside the repo workspace.
- No database is added.

## Expected Contract Focus

The contract must explicitly allow only safe local reads for `.mcp-task/` artifacts and forbid arbitrary filesystem access.
