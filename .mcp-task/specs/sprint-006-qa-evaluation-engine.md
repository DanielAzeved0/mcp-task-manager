# SPEC - SPRINT-006 QA and Evaluation Engine

## Goal

Add contract-based QA validation and score-based Evaluation so a sprint cannot be marked passed or done below the required quality threshold.

## Scope

- Define local QA result schema.
- Define local Evaluation schema.
- Persist QA results under `.mcp-task/qa/`.
- Persist Evaluation results under `.mcp-task/evaluations/`.
- Expose QA result and Evaluation gate in `/workspace`.
- Render QA checklist and Evaluation gate in the IDE shell.
- Keep execution visual-only and file-backed.

## Requirements

- QA must validate item by item against the Contract.
- QA must stay separate from Builder.
- Evaluation can pass only when QA passes.
- Evaluation score must be 90 or higher to pass.
- Evaluation must include standard checks for contract compliance, architecture, simplicity, offline support, UI consistency and validation.
- Failed QA or low score must route the sprint back to Build.
- No real shell command or MCP tool execution is allowed from the UI.

## Acceptance Criteria

- `/workspace` returns QA result for the current sprint.
- `/workspace` returns Evaluation gate for the current sprint.
- UI renders QA items with passed, failed or pending state.
- UI blocks Done when QA fails or Evaluation score is below 90.
- Local validation rejects invalid QA and Evaluation files.
