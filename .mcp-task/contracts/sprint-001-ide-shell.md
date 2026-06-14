# Contract - SPRINT-001 IDE Shell Foundation

## sprint_id

`SPRINT-001`

## objective

Establish the first MCP Harness Task Manager sprint by adding local project artifacts and replacing the initial frontend with an IDE-like task manager shell that includes a visual terminal.

## allowed_changes

- Add files under `.mcp-task/`.
- Update `public/index.html` product title/loading text.
- Replace `public/app.js` with a visual-first local browser shell.
- Replace `public/styles.css` with the IDE layout styles.
- Remove external browser CDN dependencies from the visual shell.
- Run existing build/validation scripts.

## forbidden_changes

- Do not execute real shell commands from the UI.
- Do not add a database.
- Do not add authentication, billing, teams or SaaS features.
- Do not remove backend endpoints.
- Do not introduce new npm dependencies.
- Do not require external browser CDNs for the Sprint 1 shell.
- Do not rewrite unrelated backend modules.

## acceptance_criteria

- `.mcp-task/specs/initial-product-spec.md` exists.
- `.mcp-task/sprints/sprint-001-ide-shell.md` exists.
- `.mcp-task/contracts/sprint-001-ide-shell.md` exists.
- Frontend shows the product name MCP Harness Task Manager.
- Frontend includes top bar, left sidebar, center document tabs, right status sidebar and bottom panel.
- Center tabs include `spec.md`, `progress.md`, `contract.md` and `evaluation.json`.
- Bottom panel shows visual terminal events prefixed with `mcp-task>`.
- UI communicates that terminal execution is visual-only.
- The implementation remains offline-friendly and does not require a remote service for the visual shell.
- Browser shell scripts and styles are served from local project files.
- The frontend can be opened directly from `public/index.html` without a dev server.
- Existing TypeScript build passes.

## qa_checklist

- [x] Verify local artifact paths.
- [x] Verify frontend layout files changed only under allowed public files.
- [x] Verify no dependency was added.
- [x] Verify visual terminal has simulated structured logs.
- [x] Verify no browser shell execution was implemented.
- [x] Verify `npm run build` result.

## expected_outputs

- `.mcp-task/specs/initial-product-spec.md`
- `.mcp-task/sprints/sprint-001-ide-shell.md`
- `.mcp-task/contracts/sprint-001-ide-shell.md`
- `.mcp-task/evaluations/sprint-001-evaluation.json`
- Updated `public/index.html`
- Updated `public/app.js`
- Updated `public/styles.css`

## rollback_notes

To roll back Sprint 1, restore the previous `public/` files and remove the Sprint 1 `.mcp-task/` artifacts. Backend files are not part of this sprint.
