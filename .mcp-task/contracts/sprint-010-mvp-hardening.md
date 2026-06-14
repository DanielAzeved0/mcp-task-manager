# Contract - SPRINT-010 MVP Hardening

## sprint_id

`SPRINT-010`

## objective

Harden the local MVP by validating readiness, documenting operational usage and recording remaining risks without adding major features or infrastructure.

## allowed_changes

- Add MVP readiness types and validators.
- Add deterministic readiness report generation helpers.
- Add golden tests for readiness score, failed required checks, README sections, package metadata and CLI expectations.
- Update README with MVP local usage, limitations and validation commands.
- Add `.mcp-task/docs/mvp-readiness.md`.
- Add `.mcp-task/evaluations/sprint-010-mvp-readiness.json`.
- Update SPRINT-010 `.mcp-task` artifacts.

## forbidden_changes

- Do not add SaaS, auth, billing, teams or cloud sync.
- Do not add a database, vector database or embeddings.
- Do not publish to npm.
- Do not add release automation.
- Do not add desktop packaging.
- Do not add new dependencies.
- Do not introduce automatic command execution.
- Do not rewrite unrelated prompt generator runtime code.

## acceptance_criteria

- Readiness report cannot be ready below score 90.
- Readiness report cannot be ready with a failed required check.
- README includes local MVP, CLI, validation and limitations sections.
- Package metadata continues exposing `bin.mcp-task`.
- CLI `status` and `doctor` remain independent of HTTP server startup.
- `node --check public/app.js` passes.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.
- Built CLI `status`, `doctor` and `--help` pass.

## qa_checklist

- [ ] Validate readiness report schema.
- [ ] Validate failed required checks block ready.
- [ ] Validate score below 90 blocks ready.
- [ ] Validate README operational sections.
- [ ] Validate CLI commands after build.
- [ ] Confirm no new dependencies or cloud infrastructure.
- [ ] Run build and golden tests.

## expected_outputs

- `src/core/mvp/readiness.ts`
- `src/tests/golden/goldenRunner.ts`
- `README.md`
- `.mcp-task/docs/mvp-readiness.md`
- `.mcp-task/evaluations/sprint-010-mvp-readiness.json`
- `.mcp-task/specs/sprint-010-mvp-hardening.md`
- `.mcp-task/contracts/sprint-010-mvp-hardening.md`
- `.mcp-task/progress/sprint-010.json`
- `.mcp-task/qa/sprint-010-qa.json`
- `.mcp-task/evaluations/sprint-010-evaluation.json`
- `.mcp-task/logs/sprint-010.md`

## rollback_notes

Remove readiness helper/tests and SPRINT-010 readiness artifacts. Existing product behavior should remain unchanged.
