# Contract - SPRINT-002 File-Backed Workspace Runtime

## sprint_id

`SPRINT-002`

## objective

Replace seeded Sprint 1 UI state with a safe local file-backed runtime that reads `.mcp-task/` artifacts through backend endpoints and renders the current workspace in the IDE shell.

## allowed_changes

- Add TypeScript types/use cases for workspace artifacts.
- Add safe local read utilities under `src/infra/file-system/`.
- Add backend routes for workspace summary and artifact reads.
- Register the new workspace routes in the Express app.
- Update `public/app.js` to fetch workspace data from the local backend when available.
- Keep fallback/error/empty states in the frontend.
- Add focused tests for path safety, artifact classification and workspace summary behavior.
- Update `.mcp-task/` sprint/evaluation artifacts for Sprint 2.

## forbidden_changes

- Do not add write endpoints.
- Do not execute shell commands from the UI.
- Do not call real MCP tools from the UI.
- Do not add a database.
- Do not add authentication, billing, teams or SaaS features.
- Do not introduce new npm dependencies.
- Do not rewrite unrelated prompt generator routes/services.
- Do not allow reads outside `.mcp-task/`.
- Do not support arbitrary file extensions beyond Markdown, JSON and plain text logs in this sprint.

## acceptance_criteria

- `GET /workspace` returns a workspace summary derived from actual `.mcp-task/` files.
- `GET /workspace/artifact?path=...` returns content for supported artifacts inside `.mcp-task/`.
- Path traversal with `..` is rejected.
- Absolute paths are rejected.
- Paths resolving outside `.mcp-task/` are rejected.
- Missing workspace/artifacts return structured errors.
- Frontend loads workspace summary from backend when available.
- Frontend document tabs and terminal events reflect real `.mcp-task/` artifacts when backend is available.
- Frontend keeps a clear error/offline state when backend is not available.
- No file writes are exposed by Sprint 2.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.

## qa_checklist

- [x] Confirm the route registration does not break existing routes.
- [x] Confirm safe path checks reject `..`.
- [x] Confirm safe path checks reject absolute paths.
- [x] Confirm unsupported extensions are rejected.
- [x] Confirm `.mcp-task/sprints/roadmap.md` appears in workspace artifacts.
- [x] Confirm logs are surfaced as visual terminal events.
- [x] Confirm frontend retains IDE layout.
- [x] Confirm no new dependencies were added.
- [x] Run build and golden tests.

## expected_outputs

- `src/infra/file-system/workspaceArtifacts.ts`
- `src/routes/workspaceRoute.ts`
- Updated `src/server/app.ts`
- Updated `src/tests/golden/goldenRunner.ts` or equivalent local test coverage
- Updated `public/app.js`
- Updated `.mcp-task/sprints/sprint-002-file-backed-runtime.md`
- Updated `.mcp-task/evaluations/sprint-002-evaluation.json`

## rollback_notes

Remove the new workspace route registration and new `src/infra/file-system/` files, then restore `public/app.js` to the Sprint 1 static shell. No database or external state rollback is required.
