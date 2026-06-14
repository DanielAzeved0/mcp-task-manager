# SPEC - SPRINT-004 Contract Builder and Gatekeeping

## Goal

Make Contract creation a first-class local workflow and block Build until the current sprint has a valid Contract.

## Scope

- Validate Contract Markdown fields.
- Allow Contract authoring only inside `.mcp-task/contracts/`.
- Expose Contract gate state in workspace summary.
- Show blocked and ready Build states in the IDE shell.
- Show a Contract checklist with exact missing fields.
- Record Contract authoring and validation events in local logs.

## Requirements

- Contract must include `sprint_id`, `objective`, `allowed_changes`, `forbidden_changes`, `acceptance_criteria`, `qa_checklist`, `expected_outputs` and `rollback_notes`.
- Build must remain disabled when Contract is missing or invalid.
- Build may become visually available when Contract is valid.
- Builder must not validate its own work.
- QA checklist must be explicit and itemized.
- The app must remain offline-first and file-backed.
- No shell command execution from UI is allowed in this sprint.

## Acceptance Criteria

- User can create and save a valid Contract for the current sprint.
- Invalid Contract validation reports exact missing fields.
- Workspace summary exposes Contract gate status.
- UI disables Build while Contract is missing or invalid.
- UI shows Contract checklist in the right sidebar.
- Writes remain restricted to approved `.mcp-task/` authoring folders.
