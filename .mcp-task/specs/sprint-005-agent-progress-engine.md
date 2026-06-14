# SPEC - SPRINT-005 Agent Activity and Progress Engine

## Goal

Track logical agent roles, task ownership, activity events and sprint progress as local structured state.

## Scope

- Define local agent role state.
- Define local sprint progress state.
- Persist progress under `.mcp-task/progress/`.
- Persist agent roles under `.mcp-task/agents/`.
- Surface agents, progress and events in `/workspace`.
- Render agent rows and activity timeline from local files.
- Keep execution simulated and visual-only.

## Requirements

- Agents must declare name, role, goal, allowed actions, forbidden actions, inputs, outputs and status.
- Sprint progress must declare sprint id, stage, status, agents, events and updated timestamp.
- Events must include id, sprint id, agent, type, message and ISO timestamp.
- Event artifact paths must stay inside `.mcp-task/`.
- Builder must not validate its own completion.
- QA and Evaluator must remain separate logical roles.
- No real shell command or MCP tool execution is allowed from the UI.

## Acceptance Criteria

- `/workspace` returns agent state.
- `/workspace` returns progress state for the current sprint.
- UI renders agents from local state.
- UI renders a local activity timeline.
- Terminal includes recorded local progress events.
- Invalid agent/progress/event schemas are covered by local validation.
