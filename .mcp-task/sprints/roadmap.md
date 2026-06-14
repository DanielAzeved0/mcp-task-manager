# MCP Harness Task Manager - Sprint Roadmap

## Product Goal

Build an offline-first IDE-like harness for managing AI-assisted software development through a controlled workflow:

```txt
SPEC -> Contract -> Build -> QA -> Evaluation -> Done
```

The first usable product should let the repository owner manage one local project end to end using files under `.mcp-task/`, visible sprint state, agent responsibilities, contract validation and a traceable visual terminal.

## Target User

Primary user: the repository owner/developer working locally with AI agents.

Core job: turn AI-assisted development work into small, auditable sprints that cannot skip SPEC, Contract, QA or Evaluation.

Success condition: a local sprint can be planned, constrained, tracked, validated and evaluated from the app without relying on cloud storage or SaaS infrastructure.

## MVP Workflows

- Open the local MCP Harness workspace.
- See current sprint, pipeline stage and local artifacts.
- Create or update a SPEC.
- Generate a sprint plan from the SPEC.
- Generate a contract from a sprint plan.
- Track Builder, QA and Evaluator activity.
- Record logs and progress to local files.
- Run validation commands from explicit user action only.
- Produce an evaluation score and prevent Done below 90.
- Review past sprints and local memory.

## Out Of Scope Until After MVP

- Multi-user SaaS.
- Authentication and billing.
- Cloud sync.
- Team workspaces.
- Complex role management.
- Database persistence.
- Autonomous destructive shell actions.
- Real-time collaboration.

## Sprint Sequence

| Sprint | Title | Status | Primary Outcome |
| --- | --- | --- | --- |
| SPRINT-001 | IDE Shell Foundation | passed | Local artifacts and visual IDE shell exist. |
| SPRINT-002 | File-Backed Workspace Runtime | passed | UI reads real `.mcp-task/` files instead of seeded static state. |
| SPRINT-003 | SPEC and Sprint Authoring Flow | passed | User can create/update SPECs and sprint plans locally. |
| SPRINT-004 | Contract Builder and Gatekeeping | passed | Contracts are generated, validated and required before Build. |
| SPRINT-005 | Agent Activity and Progress Engine | passed | Agent roles, progress and events are tracked as local state. |
| SPRINT-006 | QA and Evaluation Engine | passed | Contract checklist validation and score-based Done gate exist. |
| SPRINT-007 | Explicit Tool Execution Harness | passed | User-approved local commands and MCP tool calls are traceable. |
| SPRINT-008 | Local Memory and History | passed | Past sprints, decisions and reusable context are searchable locally. |
| SPRINT-009 | Packaging and CLI Foundation | passed | App is ready to evolve into an installable npm tool. |
| SPRINT-010 | MVP Hardening | passed | Responsive, reliable, documented MVP with clear risks. |
| SPRINT-011 | Docker Runtime | passed | App runs in Docker with API and static UI from one container. |

## Acceptance Criteria For The Roadmap

- Each sprint has a small, testable outcome.
- Sprint 1 remains the foundation and is not re-opened.
- Future sprints do not claim Done before QA and Evaluation.
- No future sprint introduces SaaS complexity before the local MVP is useful.
- Tool execution remains explicit, traceable and user-controlled.

## Risk Notes

- Browser-only file access may constrain direct `.mcp-task/` writes; the likely solution is a small local backend route layer, not a database.
- Existing prompt-generator backend should be preserved until replacement boundaries are clear.
- The UI must avoid pretending to execute commands before a real explicit execution harness exists.
