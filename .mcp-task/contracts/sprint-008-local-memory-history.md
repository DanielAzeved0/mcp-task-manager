# Contract - SPRINT-008 Local Memory and History

## sprint_id

`SPRINT-008`

## objective

Implement local memory and sprint history so past sprint artifacts, project decisions and reusable context are searchable and browsable without adding database, vector search or cloud memory.

## allowed_changes

- Add local memory and history types, validators and indexing helpers.
- Add local sprint history association by `sprintId`.
- Add deterministic text search over supported `.mcp-task/` files.
- Add decision note creation under `.mcp-task/memory/decisions/`.
- Expose memory index, search and decision write APIs through workspace routes.
- Expose memory summary from `/workspace`.
- Render sprint history, memory search results and decision note creation in `public/app.js`.
- Add styling needed for memory/history UI in `public/styles.css`.
- Add golden tests for history association, search, decision validation and unsafe path rejection.
- Update SPRINT-008 `.mcp-task` artifacts.

## forbidden_changes

- Do not add a database.
- Do not add vector database, embeddings or semantic search.
- Do not add cloud sync or remote memory.
- Do not add SaaS, auth, billing or team behavior.
- Do not execute commands from memory/history UI.
- Do not add new npm dependencies.
- Do not rewrite unrelated prompt generator runtime code.
- Do not mark SPRINT-008 done without QA and Evaluation artifacts.

## acceptance_criteria

- Sprint history is derived from `.mcp-task/sprints/`.
- Each sprint can show related SPEC, Contract, QA, Evaluation, progress, logs and tool execution artifacts when available.
- Local search returns deterministic results with title, excerpt, path and score.
- Decision notes are saved as human-readable Markdown in `.mcp-task/memory/decisions/`.
- Unsafe related artifact paths are rejected.
- Missing individual artifacts do not break index creation.
- UI exposes browse, search and decision creation flows.
- `node --check public/app.js` passes.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.

## qa_checklist

- [ ] Validate memory document schema.
- [ ] Validate sprint history association.
- [ ] Validate deterministic local search.
- [ ] Validate decision note creation.
- [ ] Validate unsafe path rejection.
- [ ] Confirm no database/vector/cloud memory was introduced.
- [ ] Run build and golden tests.

## expected_outputs

- `src/infra/file-system/localMemory.ts`
- `src/infra/file-system/workspaceArtifacts.ts`
- `src/routes/workspaceRoute.ts`
- `public/app.js`
- `public/styles.css`
- `src/tests/golden/goldenRunner.ts`
- `.mcp-task/specs/sprint-008-local-memory-history.md`
- `.mcp-task/contracts/sprint-008-local-memory-history.md`
- `.mcp-task/progress/sprint-008.json`
- `.mcp-task/qa/sprint-008-qa.json`
- `.mcp-task/evaluations/sprint-008-evaluation.json`
- `.mcp-task/logs/sprint-008.md`

## rollback_notes

Remove local memory routes, index helpers, UI panels and SPRINT-008 memory artifacts. Existing decision Markdown files can remain as audit history.
