# Sprint SPRINT-007 - Explicit Tool Execution Harness

## Goal

Introduce explicit, traceable command/tool execution for validation and MCP tool usage, controlled by the user.

## Status

`passed`

## Scope

- Tool registry abstraction.
- Command proposal model.
- User approval state.
- Execution logs.
- Safe validation command presets.

## Tasks

- [x] Define `McpTool`, `McpToolCall` and `McpToolResult` types.
- [x] Define local command proposal schema.
- [x] Add allowlisted validation command presets from `package.json`.
- [x] Require explicit user action before execution.
- [x] Log command, result, timestamp and exit status.
- [x] Surface failed commands in QA/Evaluation.

## Acceptance Criteria

- No command runs without explicit user action.
- Tool calls are logged with inputs and outputs.
- Validation commands come from project scripts or explicit user input.
- Dangerous commands are blocked or require a future dedicated security contract.
- UI clearly separates proposed commands from executed commands.

## Expected Contract Focus

The contract must include security boundaries, logging requirements and forbidden destructive commands.

## Validation

- `node --check public/app.js` passed.
- `npm.cmd run build` passed.
- `npm.cmd run test:golden` passed.
- Golden coverage validates package script presets, approval gating, blocked destructive commands, execution results, MCP tool calls and failed command surfacing.
