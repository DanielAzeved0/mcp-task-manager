# Contract - SPRINT-006 QA and Evaluation Engine

## sprint_id

`SPRINT-006`

## objective

Implement local QA result validation and Evaluation score gating so a sprint cannot pass or reach Done without QA passing and score >= 90.

## allowed_changes

- Add local QA result types and validation.
- Add local Evaluation types and validation.
- Read `.mcp-task/qa/sprint-006-qa.json`.
- Read `.mcp-task/evaluations/sprint-006-evaluation.json`.
- Expose QA result and Evaluation gate from `/workspace`.
- Render QA checklist and Evaluation gate in the IDE shell.
- Add golden tests for QA, Evaluation and score gating.
- Update `.mcp-task/` artifacts for Sprint 6.

## forbidden_changes

- Do not execute real shell commands from the UI.
- Do not execute real MCP tools from the UI.
- Do not let Builder validate its own completion.
- Do not mark Done when Evaluation score is below 90.
- Do not add database persistence.
- Do not add SaaS, auth, billing, team or cloud-sync behavior.
- Do not introduce new npm dependencies.
- Do not rewrite unrelated prompt generator runtime code.

## acceptance_criteria

- QA result references a Contract inside `.mcp-task/contracts/`.
- QA items can pass, fail or remain pending independently.
- Evaluation cannot pass when QA failed.
- Evaluation cannot pass below score 90.
- Workspace summary includes QA result and Evaluation gate.
- IDE shell displays QA checklist and Done gate status.
- `node --check public/app.js` passes.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.

## qa_checklist

- [x] Validate QA item schema.
- [x] Validate QA result schema.
- [x] Validate Evaluation schema.
- [x] Validate QA failure blocks Evaluation pass.
- [x] Validate score below 90 blocks pass.
- [x] Confirm UI remains visual-only.
- [x] Run build and golden tests.

## expected_outputs

- Updated `src/infra/file-system/workspaceArtifacts.ts`
- Updated `src/tests/golden/goldenRunner.ts`
- Updated `public/app.js`
- Updated `public/styles.css`
- `.mcp-task/qa/sprint-006-qa.json`
- `.mcp-task/evaluations/sprint-006-evaluation.json`
- `.mcp-task/specs/sprint-006-qa-evaluation-engine.md`
- `.mcp-task/contracts/sprint-006-qa-evaluation-engine.md`
- `.mcp-task/progress/sprint-006.json`
- `.mcp-task/logs/sprint-006.md`

## rollback_notes

Remove QA/Evaluation readers and restore the score panel to latest Evaluation summary only. Local QA/Evaluation JSON files can remain as audit history.
