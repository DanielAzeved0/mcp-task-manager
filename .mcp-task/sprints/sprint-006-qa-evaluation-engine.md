# Sprint SPRINT-006 - QA and Evaluation Engine

## Goal

Add contract-based QA validation and score-based evaluation so a sprint cannot be marked Done below 90.

## Status

`passed`

## Linked SPEC

.mcp-task/specs/sprint-006-qa-evaluation-engine.md

## Scope

- QA checklist runner.
- Manual validation results.
- Evaluation JSON creation.
- Done gate based on score.
- Failure loop back to Build.

## Tasks

- [x] Define QA result schema.
- [x] Define evaluation scoring rules.
- [x] Add UI for checking acceptance criteria item by item.
- [x] Generate evaluation JSON from QA results.
- [x] Block Done when score is below 90.
- [x] Mark failed criteria and route sprint status back to Build.

## Acceptance Criteria

- QA checklist is derived from the sprint contract.
- Each acceptance criterion can pass or fail independently.
- Evaluation follows the required JSON format.
- Sprint status can become `passed`, `failed` or `done`.
- Done is impossible when score is lower than 90.

## Expected Contract Focus

The contract must define exact score thresholds and must forbid automatic Done without explicit QA and Evaluation records.

## Validation

- `node --check public/app.js` passed.
- `npm.cmd run build` passed.
- `npm.cmd run test:golden` passed.
- Golden coverage validates QA result schema, Evaluation checks, QA failure blocking pass and score below 90 blocking pass.
