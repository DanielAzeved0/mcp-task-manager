# Contract - SPRINT-004 Contract Builder and Gatekeeping

## sprint_id

`SPRINT-004`

## objective

Implement Contract creation and validation as the required gate before Build can start for the current sprint.

## allowed_changes

- Add Contract validation helpers for required Markdown sections.
- Add workspace summary state describing whether Build is blocked by Contract status.
- Add scoped write support for `.mcp-task/contracts/*.md`.
- Add Contract editor/draft creation in the IDE shell.
- Add Contract checklist display in the right sidebar.
- Add Build gate button state that remains disabled until the Contract is valid.
- Add golden tests for Contract validation and write scope.
- Update `.mcp-task/` artifacts for Sprint 4.

## forbidden_changes

- Do not execute real Build commands from the UI.
- Do not execute shell commands or MCP tools from the UI.
- Do not let Builder validate its own completion.
- Do not add database persistence.
- Do not add SaaS, auth, billing, team or cloud-sync behavior.
- Do not introduce new npm dependencies.
- Do not rewrite unrelated prompt generator runtime code.

## acceptance_criteria

- `POST /workspace/artifact` accepts valid Contract Markdown under `.mcp-task/contracts/`.
- Invalid Contracts return exact missing fields.
- Workspace summary includes Contract gate status for the current sprint.
- Build is blocked when Contract is missing or invalid.
- Build is visually available when Contract is valid.
- Contract checklist displays all required fields.
- Existing SPEC and sprint authoring behavior remains intact.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.

## qa_checklist

- [x] Validate required Contract section detection.
- [x] Validate invalid Contract missing fields.
- [x] Validate scoped Contract write path.
- [x] Validate Build blocked state when Contract is invalid.
- [x] Validate Build ready state when Contract is valid.
- [x] Validate no new dependencies were added.
- [x] Run build and golden tests.

## expected_outputs

- Updated `src/infra/file-system/workspaceArtifacts.ts`
- Updated `src/routes/workspaceRoute.ts`
- Updated `src/tests/golden/goldenRunner.ts`
- Updated `public/app.js`
- Updated `public/styles.css`
- Updated `.mcp-task/specs/sprint-004-contract-gatekeeping.md`
- Updated `.mcp-task/sprints/sprint-004-contract-gatekeeping.md`
- Updated `.mcp-task/contracts/sprint-004-contract-gatekeeping.md`
- Updated `.mcp-task/logs/sprint-004.md`
- Updated `.mcp-task/evaluations/sprint-004-evaluation.json`

## rollback_notes

Remove Contract write support, remove Contract gate summary, and restore Build to a static queued visual state. Local `.mcp-task/` Markdown files can remain as audit history.
