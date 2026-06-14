# Sprint SPRINT-005 - Agent Activity and Progress Engine

## Goal

Track logical agent roles, task ownership, activity events and sprint progress as local structured state.

## Status

`passed`

## Linked SPEC

.mcp-task/specs/sprint-005-agent-progress-engine.md

## Scope

- Agent role definitions.
- Progress file format.
- Agent activity timeline.
- Pipeline event stream.
- Visual terminal backed by recorded events.

## Tasks

- [x] Define agent role JSON format.
- [x] Define progress JSON or Markdown format.
- [x] Add local progress read/write endpoints.
- [x] Connect terminal output to recorded pipeline events.
- [x] Add activity timeline from local logs.
- [x] Keep all agent execution simulated unless explicit tool execution exists.

## Acceptance Criteria

- Agents have name, role, goal, allowed actions and forbidden actions.
- Sprint progress is persisted locally.
- Visual terminal displays real recorded events from `.mcp-task/logs/`.
- Activity timeline reflects local files, not seeded mock state.
- No agent executes tools autonomously.

## Expected Contract Focus

The contract must keep this sprint limited to state tracking and must forbid real AI/tool execution.

## Validation

- `node --check public/app.js` passed.
- `npm.cmd run build` passed.
- `npm.cmd run test:golden` passed.
- Golden coverage validates agent schema, progress schema, event timestamps and safe event artifact paths.
