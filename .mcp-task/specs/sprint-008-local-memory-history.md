# SPEC - SPRINT-008 Local Memory and History

## Goal

Make past sprint artifacts, decisions and reusable local context searchable and useful inside MCP Harness Task Manager.

## Scope

- Define local memory document and decision note formats.
- Build sprint history from `.mcp-task/sprints/`.
- Associate each sprint with related SPEC, Contract, QA, Evaluation, progress, logs and tool execution artifacts.
- Add deterministic text search over supported `.mcp-task/` documents.
- Add decision note creation under `.mcp-task/memory/decisions/`.
- Render memory search, sprint history and related artifacts in the IDE shell.

## Out of Scope

- Vector database.
- Embeddings.
- Cloud memory.
- Remote sync.
- Database persistence.
- Authentication, billing or team workspace behavior.
- Semantic search.
- Automatic command execution.

## Requirements

- Memory remains local, human-readable and file-backed.
- Search must be deterministic and cheap.
- Unsafe artifact paths must be rejected.
- Missing or unreadable artifacts must not break the whole index.
- Decision notes must be persisted as Markdown.
- UI must browse historical sprint context without mutating sprint status.

## Acceptance Criteria

- User can browse previous sprints.
- User can search local `.mcp-task/` documents.
- User can record project decisions.
- Memory remains plain Markdown/JSON files.
- No database or remote indexing is introduced.
- `node --check public/app.js` passes.
- `npm.cmd run build` passes.
- `npm.cmd run test:golden` passes.
