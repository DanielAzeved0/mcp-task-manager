# Sprint SPRINT-008 - Local Memory and History

## Goal

Make past sprint artifacts, decisions and reusable local context searchable and useful inside the harness.

## Status

`passed`

## Scope

- Local memory index.
- Sprint history browser.
- Decision notes.
- Reusable project facts.
- No vector database or cloud memory.

## Tasks

- [x] Define memory document format.
- [x] Add sprint history list from `.mcp-task/sprints/`.
- [x] Add search/filter over local artifacts.
- [x] Add decision note creation.
- [x] Show related SPEC, contract, evaluation and logs for each sprint.

## Acceptance Criteria

- User can browse previous sprints.
- User can search local `.mcp-task/` documents.
- User can record project decisions.
- Memory remains plain Markdown/JSON files.
- No database or remote indexing is introduced.

## Expected Contract Focus

The contract must keep memory local, human-readable and cheap to maintain.

## Validation

- `node --check public/app.js` passed.
- `npm.cmd run build` passed.
- `npm.cmd run test:golden` passed.
- Golden coverage validates memory documents, decision notes, search query limits, unsafe path rejection and sprint artifact association.
