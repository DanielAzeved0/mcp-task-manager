# Sprint SPRINT-004 - Contract Builder and Gatekeeping

## Goal

Make Contract creation a first-class workflow and block Build actions until a valid sprint contract exists.

## Status

`passed`

## Linked SPEC

.mcp-task/specs/sprint-004-contract-gatekeeping.md

## Scope

- Contract generation template.
- Contract validation rules.
- UI state for `planned`, `contract_ready` and blocked Build.
- Contract checklist display.

## Tasks

- [x] Define contract schema fields.
- [x] Add contract creation/update flow.
- [x] Add validator for required contract sections.
- [x] Show blocked Build state when contract is missing or invalid.
- [x] Add contract checklist to right sidebar.
- [x] Write contract events to logs.

## Acceptance Criteria

- User can create a contract for a planned sprint.
- Invalid contracts show exact missing fields.
- Build actions stay disabled until the contract is valid.
- Contract includes allowed changes, forbidden changes, acceptance criteria and QA checklist.

## Expected Contract Focus

The contract must define how Builder and QA responsibilities are separated and must prevent the Builder from self-validating completion.

## Validation

- `node --check public/app.js` passed.
- `npm.cmd run build` passed.
- `npm.cmd run test:golden` passed.
- Golden coverage validates Contract write scope, required Contract fields and invalid Contract missing-field reporting.
