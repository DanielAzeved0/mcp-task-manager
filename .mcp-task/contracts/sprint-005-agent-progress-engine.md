# Contract - SPRINT-005 Agent Activity and Progress Engine

## sprint_id

`SPRINT-005`

## objective

Implement local agent activity and sprint progress tracking without executing real agents, shell commands or MCP tools.

## allowed_changes

- Add local agent state types and validation.
- Add local progress state types and validation.
- Read `.mcp-task/agents/agents.json`.
- Read `.mcp-task/progress/sprint-005.json`.
- Expose agent and progress summaries from `/workspace`.
- Render agents and activity timeline from workspace state.
- Add focused golden tests for agent, progress and event validation.
- Update `.mcp-task/` artifacts for Sprint 5.

## forbidden_changes

- Do not execute real shell commands from the UI.
- Do not execute real MCP tools from the UI.
- Do not add autonomous agent execution.
- Do not let Builder validate its own completion.
- Do not add database persistence.
- Do not add SaaS, auth, billing, team or cloud-sync behavior.
- Do not introduce new npm dependencies.
- Do not rewrite unrelated prompt generator runtime code.

## acceptance_criteria

- Agents have name, role, goal, allowed actions, forbidden actions, inputs, outputs and status.
- Sprint progress is persisted locally.
- Workspace summary includes agents and progress.
- Visual terminal includes recorded local progress events.
- Activity timeline reflects local progress events.
- No agent executes tools autonomously.
- `node --check public/app.js` passes.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.

## qa_checklist

- [x] Validate agent schema.
- [x] Validate progress schema.
- [x] Validate event schema.
- [x] Validate artifact path safety for events.
- [x] Confirm UI uses workspace agent state.
- [x] Confirm terminal remains visual-only.
- [x] Run build and golden tests.

## expected_outputs

- Updated `src/infra/file-system/workspaceArtifacts.ts`
- Updated `src/tests/golden/goldenRunner.ts`
- Updated `public/app.js`
- Updated `public/styles.css`
- `.mcp-task/agents/agents.json`
- `.mcp-task/progress/sprint-005.json`
- `.mcp-task/specs/sprint-005-agent-progress-engine.md`
- `.mcp-task/contracts/sprint-005-agent-progress-engine.md`
- `.mcp-task/logs/sprint-005.md`
- `.mcp-task/evaluations/sprint-005-evaluation.json`

## rollback_notes

Remove agent/progress readers and restore static agent rows. Local JSON state files can remain as audit history.
