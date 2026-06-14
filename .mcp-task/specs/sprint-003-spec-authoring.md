# SPEC - SPRINT-003 SPEC and Sprint Authoring Flow

## Goal

Allow the user to create and update local SPEC and sprint plan Markdown files from the MCP Harness Task Manager app.

## Scope

- Add local authoring support for `.mcp-task/specs/` Markdown files.
- Add local authoring support for `.mcp-task/sprints/` Markdown files.
- Keep all writes constrained to `.mcp-task/specs/` and `.mcp-task/sprints/`.
- Require sprint plans to reference an existing SPEC path.
- Surface loading, empty, dirty, saving, saved and failed-save states in the IDE shell.
- Record authoring events in local sprint logs.

## Requirements

- The app must remain offline-first.
- The backend must reject absolute paths and path traversal.
- The backend must reject writes outside the allowed authoring folders.
- The backend must reject empty content.
- The backend must reject sprint plan saves without a referenced SPEC in `.mcp-task/specs/`.
- The frontend must not claim Contract, Build, QA, Evaluation or Done are complete for this sprint.
- Existing read endpoints must remain compatible.

## Acceptance Criteria

- User can create a new SPEC locally.
- User can edit and save an existing SPEC Markdown artifact.
- User can create a sprint plan linked to a SPEC.
- User can edit and save an existing sprint Markdown artifact when it references a SPEC.
- UI shows unsaved, saving, saved and failed-save states.
- Writes to `.mcp-task/contracts/`, `.mcp-task/evaluations/`, `.mcp-task/logs/`, `.mcp-task/memory/` and roadmap are rejected.
- Build and golden validation pass.
