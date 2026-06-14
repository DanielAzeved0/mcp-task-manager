# Contract - SPRINT-007 Explicit Tool Execution Harness

## sprint_id

`SPRINT-007`

## objective

Implement an explicit, file-backed command and MCP tool execution harness so validation commands and tool calls are proposed, approved, executed and audited without implicit side effects.

## allowed_changes

- Add execution harness domain types and validators.
- Add local JSON persistence under `.mcp-task/tools/`.
- Add safe command presets derived from `package.json` scripts.
- Add explicit approval and execution APIs for command proposals.
- Add bounded execution logs with timestamps, exit status, stdout preview and stderr preview.
- Expose tool execution state, failed commands and summary data from `/workspace`.
- Render command proposal, approval, execution and failure state in `public/app.js`.
- Add styling needed for the execution harness UI in `public/styles.css`.
- Add golden tests for proposal generation, approval gate, blocked command handling, execution result validation and QA/Evaluation surfacing.
- Update SPRINT-007 `.mcp-task` artifacts.

## forbidden_changes

- Do not execute commands automatically.
- Do not approve blocked commands.
- Do not add destructive command execution support.
- Do not add SaaS, auth, billing, team workspace, database or cloud sync behavior.
- Do not add new npm dependencies.
- Do not rewrite unrelated prompt generator runtime code.
- Do not mark SPRINT-007 done without QA and Evaluation artifacts.

## acceptance_criteria

- No command executes without an approved proposal.
- Blocked commands cannot be approved or executed.
- Validation command presets are derived from existing `package.json` scripts.
- Tool calls are represented with inputs, outputs, status and timestamps.
- Executions are persisted with command, result, timestamp and exit status.
- Workspace summary includes tool execution state and failed execution count.
- Failed commands are visible to QA/Evaluation and the IDE shell.
- UI clearly separates proposed, approved, executed and failed commands.
- `node --check public/app.js` passes.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.

## qa_checklist

- [ ] Validate command proposal schema.
- [ ] Validate MCP tool call/result schema.
- [ ] Validate package script proposal generation.
- [ ] Validate approval is required before execution.
- [ ] Validate blocked command cannot be approved.
- [ ] Validate failed execution is surfaced.
- [ ] Validate UI separates execution states.
- [ ] Run build and golden tests.

## expected_outputs

- `src/infra/mcp/toolExecutionHarness.ts`
- `src/infra/file-system/workspaceArtifacts.ts`
- `src/routes/workspaceRoute.ts`
- `public/app.js`
- `public/styles.css`
- `src/tests/golden/goldenRunner.ts`
- `.mcp-task/specs/sprint-007-explicit-tool-execution.md`
- `.mcp-task/contracts/sprint-007-explicit-tool-execution.md`
- `.mcp-task/progress/sprint-007.json`
- `.mcp-task/qa/sprint-007-qa.json`
- `.mcp-task/evaluations/sprint-007-evaluation.json`
- `.mcp-task/logs/sprint-007.md`

## rollback_notes

Remove execution harness routes, types, UI panels and `.mcp-task/tools/` state. Restore workspace summary to the SPRINT-006 QA/Evaluation surface.
