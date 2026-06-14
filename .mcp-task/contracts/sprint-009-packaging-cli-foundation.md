# Contract - SPRINT-009 Packaging and CLI Foundation

## sprint_id

`SPRINT-009`

## objective

Add local npm package foundations and a minimal `mcp-task` CLI without publishing, cloud distribution or new infrastructure.

## allowed_changes

- Update package metadata to align with MCP Harness Task Manager.
- Add `bin.mcp-task` pointing to the built CLI entrypoint.
- Add CLI core and entrypoint files under `src/cli/`.
- Add CLI commands `start`, `status`, `doctor`, `help` and `version`.
- Reuse local workspace readers for status.
- Add doctor checks for Node runtime, package metadata, `.mcp-task/` and essential scripts.
- Update README with local CLI usage.
- Add golden tests for CLI parsing, status formatting, doctor checks and package metadata validation.
- Update SPRINT-009 `.mcp-task` artifacts.

## forbidden_changes

- Do not publish to npm.
- Do not add publish scripts or release automation.
- Do not add new dependencies.
- Do not add SaaS, auth, billing, team or cloud-sync behavior.
- Do not add database persistence.
- Do not execute destructive commands.
- Do not remove existing development, build or test scripts.
- Do not rewrite unrelated prompt generator runtime code.

## acceptance_criteria

- `package.json` contains `bin.mcp-task`.
- Existing scripts remain available.
- `mcp-task status` reads local workspace state without requiring HTTP.
- `mcp-task doctor` validates local prerequisites.
- Unknown commands produce a controlled error.
- CLI errors do not print stack traces by default.
- README documents local CLI usage.
- `node --check public/app.js` passes.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.
- Built CLI commands `status`, `doctor` and `--help` run successfully.

## qa_checklist

- [ ] Validate package metadata.
- [ ] Validate CLI parser.
- [ ] Validate status summary formatting.
- [ ] Validate doctor checks.
- [ ] Validate unknown command error.
- [ ] Validate README CLI usage.
- [ ] Run build, golden tests and built CLI commands.

## expected_outputs

- `src/cli/cliCore.ts`
- `src/cli/mcp-task.ts`
- `package.json`
- `package-lock.json`
- `README.md`
- `src/tests/golden/goldenRunner.ts`
- `.mcp-task/specs/sprint-009-packaging-cli-foundation.md`
- `.mcp-task/contracts/sprint-009-packaging-cli-foundation.md`
- `.mcp-task/progress/sprint-009.json`
- `.mcp-task/qa/sprint-009-qa.json`
- `.mcp-task/evaluations/sprint-009-evaluation.json`
- `.mcp-task/logs/sprint-009.md`

## rollback_notes

Remove `src/cli/`, remove `bin.mcp-task` and CLI docs. Keep existing server and workspace behavior unchanged.
