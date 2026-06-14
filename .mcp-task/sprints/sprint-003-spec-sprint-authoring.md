# Sprint SPRINT-003 - SPEC and Sprint Authoring Flow

## Goal

Allow the user to create and update local SPEC and sprint plan files from the app.

## Status

`passed`

## Linked SPEC

.mcp-task/specs/sprint-003-spec-authoring.md

## Scope

- SPEC editor/preview flow.
- Sprint plan creation from an existing SPEC.
- Local Markdown write support through backend endpoints.
- Basic dirty state, save state and validation messages.

## Tasks

- [x] Define SPEC document metadata.
- [x] Define sprint plan metadata.
- [x] Add safe file write adapter for `.mcp-task/specs/` and `.mcp-task/sprints/`.
- [x] Add frontend editing state for Markdown artifacts.
- [x] Add save action with disabled/loading/error/success states.
- [x] Add validation that a sprint plan references a SPEC.
- [x] Record authoring events in logs.

## Acceptance Criteria

- User can create a new SPEC locally.
- User can create a sprint plan linked to a SPEC.
- User can edit and save existing SPEC/sprint Markdown files.
- Writes are restricted to `.mcp-task/specs/` and `.mcp-task/sprints/`.
- UI shows unsaved, saved and failed-save states.

## Expected Contract Focus

The contract must forbid edits outside `.mcp-task/specs/` and `.mcp-task/sprints/` and must preserve existing sprint files unless the user explicitly saves changes.

## Validation

- `npm.cmd run build` passed.
- `npm.cmd run test:golden` passed.
- Golden coverage validates scoped authoring paths, rejected write paths, empty content and sprint SPEC references.
