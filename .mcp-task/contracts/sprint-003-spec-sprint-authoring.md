# Contract - SPRINT-003 SPEC and Sprint Authoring Flow

## sprint_id

`SPRINT-003`

## objective

Implement local Markdown authoring for SPEC and sprint plan artifacts while preserving the offline-first `.mcp-task/` workspace model and preventing writes outside the allowed authoring folders.

## allowed_changes

- Add backend write support for `.mcp-task/specs/*.md`.
- Add backend write support for `.mcp-task/sprints/*.md`, excluding `roadmap.md`.
- Add content validation for authoring requests.
- Add sprint plan validation requiring a referenced SPEC path.
- Add local authoring event logging for Sprint 3.
- Update the Express workspace route to expose the scoped write endpoint.
- Update the IDE shell frontend to edit Markdown artifacts and show dirty/save/error states.
- Add buttons for local SPEC and sprint draft creation.
- Add focused golden tests for write path and sprint SPEC-reference validation.
- Update `.mcp-task/` SPEC, sprint, contract, log and evaluation artifacts for Sprint 3.

## forbidden_changes

- Do not allow arbitrary filesystem writes.
- Do not allow writes outside `.mcp-task/specs/` and `.mcp-task/sprints/`.
- Do not allow edits to `.mcp-task/sprints/roadmap.md` through the write endpoint.
- Do not execute shell commands from the UI.
- Do not call real MCP tools from the UI.
- Do not add a database.
- Do not add authentication, billing, teams, cloud sync or SaaS behavior.
- Do not add new npm dependencies.
- Do not rewrite unrelated prompt generator routes or services.
- Do not mark the sprint Done before QA and Evaluation.

## acceptance_criteria

- `POST /workspace/artifact` can create or update SPEC Markdown files under `.mcp-task/specs/`.
- `POST /workspace/artifact` can create or update sprint Markdown files under `.mcp-task/sprints/` when linked to an existing SPEC.
- Empty content is rejected.
- Path traversal is rejected.
- Absolute paths are rejected.
- Writes to contracts, evaluations, logs, memory and roadmap are rejected.
- Sprint plan content must include the referenced SPEC path.
- Frontend can create a SPEC draft and save it.
- Frontend can create a sprint draft linked to the first available SPEC and save it.
- Frontend shows unsaved, saving, saved and failed-save states.
- `npm run build` passes.
- `npm run test:golden` passes.

## qa_checklist

- [x] Confirm write route registration does not break existing read routes.
- [x] Confirm safe write path checks reject `..`.
- [x] Confirm safe write path checks reject absolute paths.
- [x] Confirm write route rejects non-Markdown authoring files.
- [x] Confirm write route rejects roadmap edits.
- [x] Confirm sprint plan validation requires an existing SPEC path.
- [x] Confirm frontend retains IDE layout and visual terminal behavior.
- [x] Confirm no new dependencies were added.
- [x] Run build and golden tests.

## expected_outputs

- Updated `src/infra/file-system/workspaceArtifacts.ts`
- Updated `src/routes/workspaceRoute.ts`
- Updated `src/tests/golden/goldenRunner.ts`
- Updated `public/app.js`
- Updated `public/styles.css`
- Updated `.mcp-task/specs/sprint-003-spec-authoring.md`
- Updated `.mcp-task/sprints/sprint-003-spec-sprint-authoring.md`
- Updated `.mcp-task/contracts/sprint-003-spec-sprint-authoring.md`
- Updated `.mcp-task/logs/sprint-003.md`
- Updated `.mcp-task/evaluations/sprint-003-evaluation.json`

## rollback_notes

Remove the write branch from the workspace route, remove write helper functions from `workspaceArtifacts.ts`, and restore the frontend to read-only artifact rendering. No database or external state rollback is required.
