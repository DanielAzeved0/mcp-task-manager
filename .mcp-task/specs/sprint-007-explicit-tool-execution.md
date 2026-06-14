# SPEC - SPRINT-007 Explicit Tool Execution Harness

## Goal

Introduce explicit, traceable command and MCP tool execution for validation workflows, controlled by the user and persisted locally.

## Scope

- Define execution harness types for MCP tools, tool calls, tool results, command proposals and command execution results.
- Derive safe validation command presets from `package.json` scripts.
- Require explicit user approval before any command execution.
- Persist proposals, approvals, tool calls and execution results in `.mcp-task/tools/sprint-007-tool-execution.json`.
- Surface failed command execution in workspace QA/Evaluation state.
- Render proposed, approved, executed and failed commands separately in the IDE shell.

## Out of Scope

- Autonomous command execution.
- Destructive command execution.
- Remote MCP integration beyond a local abstraction and audit model.
- SaaS, authentication, billing, cloud sync or database persistence.
- Packaging or CLI installation.

## Requirements

- Commands must be represented as structured data before execution.
- Commands with destructive patterns must be blocked.
- Approval must be explicit and persisted before execution.
- Executions must log timestamps, exit status and bounded output previews.
- Validation presets must come from scripts available in `package.json`.
- Failed executions must affect QA/Evaluation visibility.
- The app must remain offline-first and file-backed.

## Acceptance Criteria

- `McpTool`, `McpToolCall`, `McpToolResult`, `CommandProposal` and `CommandExecutionResult` are defined.
- Package scripts produce command proposals with safe risk classification.
- Proposed commands cannot execute without approval.
- Blocked commands cannot be approved.
- Executed commands are logged with timestamp, exit code and output previews.
- Failed executions appear in workspace summary and UI.
- UI separates proposed, approved, executed and failed commands.
- `node --check public/app.js` passes.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.
