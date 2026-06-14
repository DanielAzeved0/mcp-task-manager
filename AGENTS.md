# AGENTS.md

## Project Vision

This repository is evolving into **MCP Harness Task Manager**.

The goal is to build an offline-first, IDE-like application inspired by Cursor, focused on orchestrating AI agents through a controlled software development workflow.

The product must help the user manage AI-assisted development using:

```txt
SPEC → Contract → Build → QA → Evaluation → Done
```

The system must not be only a prompt/spec generator. It must become a lightweight Harness Engineering tool for managing structured AI development sessions.

---

## Core Principles

* Keep the architecture clean, simple, modular, and cheap to run.
* Prefer less code with better structure.
* Avoid overengineering.
* Prefer local files over databases when possible.
* The application must work offline.
* The UI should feel like a developer IDE, similar to Cursor or VS Code.
* Every implementation must be guided by SPECs, Contracts, progress files, and validation.
* Agents must have separate responsibilities.
* Builder agents must not validate their own work.
* QA must validate item by item against the Contract.
* If validation fails, the workflow must return to Build.
* The project should be ready to become an installable npm tool in the future.

---

## Product Direction

The application should support:

* MCP-based task management.
* Multiple specialized agents.
* Sprint-based execution.
* SPEC generation.
* Contract generation.
* Progress tracking.
* Visual terminal output.
* Agent activity timeline.
* Evaluation scoring.
* Local memory.
* MCP tools integration.
* Offline-first usage.
* Future SaaS readiness without adding unnecessary complexity now.

---

## Target User

The first target user is the repository owner/developer.

The system should be built for personal use first, but with clean boundaries so it can later evolve into:

* an open-source tool;
* an npm package;
* a SaaS product;
* a desktop-like developer tool.

Do not prematurely add SaaS complexity.

---

## Required Workflow

All major development flows must follow this pipeline:

```txt
1. SPEC
2. Sprint Plan
3. Contract
4. Build
5. QA
6. Evaluation
7. Done
```

### Rule: SPEC is mandatory

No feature should be implemented without a SPEC.

If the user asks for implementation and there is no SPEC, create or update the SPEC first.

### Rule: Contract is mandatory

No sprint should start without a Contract.

A Contract must define exactly what the Builder Agent is allowed to implement and what the QA Agent must validate.

### Rule: QA is mandatory

A task is not done just because the code was written.

A task is done only after QA and Evaluation pass.

---

## Agent Roles

Use these logical agents when planning or implementing features.

### Planner Agent

Responsible for:

* understanding the user request;
* creating or updating SPECs;
* breaking work into sprints;
* defining scope;
* avoiding one-shot implementation;
* keeping tasks small and executable.

Planner Agent must not implement production code unless explicitly asked.

---

### Contract Agent

Responsible for:

* converting sprint scope into a clear Contract;
* defining acceptance criteria;
* listing files/modules expected to change;
* defining what should not be changed;
* creating validation checklist for QA.

Contract format should be explicit and testable.

---

### Builder Agent

Responsible for:

* implementing only what is defined in the Contract;
* keeping changes small;
* respecting architecture;
* avoiding unrelated refactors;
* avoiding duplicated logic;
* not deleting tests unless explicitly required;
* not marking work as complete without QA.

Builder Agent must not be the final judge of success.

---

### QA Agent

Responsible for:

* validating the implementation against the Contract;
* checking acceptance criteria item by item;
* running or simulating available quality checks;
* identifying missing requirements;
* returning failed items clearly.

QA Agent must not expand scope.

QA Agent must not suggest unrelated features.

---

### Architect Agent

Responsible for:

* keeping the codebase clean;
* reducing unnecessary abstractions;
* enforcing modular boundaries;
* improving maintainability;
* keeping the infrastructure simple and cheap;
* making sure the project remains offline-first.

Architect Agent should prefer practical simplicity over theoretical purity.

---

### Security Agent

Responsible for:

* checking basic security issues;
* avoiding secrets in code;
* protecting local files;
* validating safe tool execution;
* avoiding dangerous shell commands;
* warning about risky MCP tool behavior.

Security Agent should not block normal development without a clear reason.

---

### Evaluator Agent

Responsible for:

* producing the final evaluation;
* generating a score;
* summarizing what passed;
* summarizing what failed;
* deciding if the sprint can be marked Done.

Evaluation should include:

```txt
Contract Compliance
Architecture Quality
Code Simplicity
Offline Support
UI Consistency
Test/Validation Status
Risk Level
Final Score
```

---

## Architecture Guidelines

Use a clean, simple, feature-based architecture.

Recommended structure:

```txt
src/
  app/
  features/
    pipeline/
    agents/
    specs/
    contracts/
    evaluations/
    terminal/
    tools/
  shared/
    ui/
    lib/
    types/
    config/
  core/
    entities/
    use-cases/
    ports/
  infra/
    file-system/
    mcp/
    local-store/
```

### Folder responsibilities

```txt
app/
  Routing, layouts, pages, app shell.

features/
  Product features grouped by domain.

shared/
  Reusable UI components, helpers, common types.

core/
  Business rules, entities, use cases, interfaces.

infra/
  File system, MCP adapters, persistence, external integrations.
```

Keep business logic out of UI components.

Keep infrastructure details out of core logic.

Avoid circular dependencies.

---

## Local Persistence

Use local files as the first persistence mechanism.

Recommended structure:

```txt
.mcp-task/
  specs/
  sprints/
  contracts/
  evaluations/
  logs/
  memory/
```

Use Markdown for human-readable documents.

Use JSON for structured data.

Avoid adding a database unless clearly necessary.

If a database becomes necessary later, prefer a lightweight option such as SQLite or Turso.

---

## UI Direction

The UI should look and feel like a modern developer IDE.

Preferred inspiration:

* Cursor
* VS Code
* MCP Inspector
* terminal-based developer tools
* dark mode developer dashboards

Required layout:

```txt
Top bar:
  Project name
  Current pipeline status
  Main actions

Left sidebar:
  Pipeline
  Sprints
  MCP tools
  Agents

Center area:
  Tabs for spec.md, progress.md, contract.md, evaluation.json
  Markdown preview/editor
  Main task details

Bottom panel:
  Visual terminal
  Agent logs
  Pipeline events

Right sidebar:
  Sprint status
  Evaluation score
  Recent activity
  Quality checklist
  Quick actions
```

The terminal is visual-first for now.

Do not execute real shell commands from the UI unless explicitly requested in a future task.

---

## Visual Terminal Rules

The terminal should show structured logs such as:

```txt
mcp-task> loading project context...
mcp-task> generating spec...
mcp-task> creating sprint contract...
mcp-task> builder agent started...
mcp-task> qa agent validating contract...
mcp-task> evaluation score: 94%
mcp-task> sprint completed
```

The terminal should feel real, but may initially be powered by local state, mock events, or simulated pipeline events.

---

## MCP Integration Rules

The project should support MCP tools.

MCP tools should be treated as external capabilities used by agents.

Do not tightly couple the UI to specific MCP tools.

Create clean adapters/interfaces for tools.

Recommended abstraction:

```txt
McpTool
McpToolRegistry
McpToolCall
McpToolResult
```

Agents may use MCP tools, but tool execution must be explicit, traceable, and logged.

---

## Multi-Agent Rules

The system should support multiple agents, but each agent must have a focused role.

Each session should use agents trained/instructed for their specific function.

Do not create one generic agent that does everything.

Preferred agents:

```txt
Planner
Contract
Builder
QA
Architect
Security
Evaluator
```

Each agent should have:

```txt
name
role
goal
allowed_actions
forbidden_actions
inputs
outputs
```

---

## Sprint Rules

Sprints are mandatory for larger work.

Each sprint should contain:

```txt
id
title
goal
scope
tasks
contract
status
logs
evaluation
```

Sprint statuses:

```txt
planned
contract_ready
building
qa_running
failed
passed
done
```

Avoid large sprints.

Break work into small, reviewable increments.

---

## Contract Rules

Every Contract must include:

```txt
sprint_id
objective
allowed_changes
forbidden_changes
acceptance_criteria
qa_checklist
expected_outputs
rollback_notes
```

Builder Agent may only implement what is inside `allowed_changes`.

QA Agent must validate every item in `acceptance_criteria`.

---

## Evaluation Rules

Every sprint should end with an Evaluation.

Evaluation format:

```txt
{
  "sprintId": "string",
  "status": "passed | failed",
  "score": 0,
  "checks": {
    "contractCompliance": true,
    "architecture": true,
    "simplicity": true,
    "offlineSupport": true,
    "uiConsistency": true,
    "validation": true
  },
  "failures": [],
  "recommendations": []
}
```

Score interpretation:

```txt
90-100: Done
75-89: Needs minor fixes
50-74: Needs rebuild
0-49: Failed
```

Do not mark sprint as Done under 90.

---

## Testing and Validation

When changing code, prefer running available project checks.

Common commands may include:

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
npm run typecheck
```

Before running commands, inspect `package.json` and use only scripts that exist.

If no tests exist, do not invent results.

Say clearly that tests are missing and recommend adding them.

---

## Refactoring Rules

Refactoring is allowed when it supports the current Contract.

Do not perform unrelated rewrites.

When refactoring:

* reduce duplicated logic;
* simplify component structure;
* improve naming;
* separate UI from business logic;
* preserve behavior;
* keep commits/changes small;
* avoid adding heavy dependencies.

---

## Infrastructure Rules

Keep infrastructure simple and cheap.

Prefer:

```txt
Next.js
local files
localStorage when appropriate
JSON/Markdown
SQLite only if needed
Vercel only when deploying
```

Avoid unless explicitly required:

```txt
Kubernetes
Redis
complex queues
microservices
heavy databases
paid infrastructure
cloud-only features
```

The project must remain usable locally/offline.

---

## SaaS Future Rules

The project may become SaaS in the future.

However, do not implement SaaS features now unless requested.

Do not add prematurely:

```txt
billing
multi-tenancy
enterprise auth
complex user roles
cloud sync
team workspaces
usage metering
```

Design boundaries so these can be added later.

---

## Code Style

* Use TypeScript when applicable.
* Prefer explicit types for core/domain objects.
* Keep functions small.
* Keep components focused.
* Avoid magic strings where constants make sense.
* Avoid unnecessary classes.
* Prefer composition over inheritance.
* Prefer readable code over clever code.
* Use clear names.

---

## Documentation Rules

Update documentation when changing behavior.

Important docs:

```txt
README.md
AGENTS.md
docs/
.mcp-task/specs/
.mcp-task/contracts/
.mcp-task/evaluations/
```

Generated project artifacts should be human-readable whenever possible.

---

## Forbidden Behavior

Do not:

* implement without SPEC;
* start sprint without Contract;
* mark work as Done without QA/Evaluation;
* let Builder validate its own work;
* add expensive infrastructure without need;
* add SaaS complexity too early;
* remove tests without reason;
* introduce secrets into the repo;
* create huge one-shot changes;
* mix UI, domain, and infra logic in the same file;
* add dependencies without checking if they are necessary.

---

## Default Behavior for Codex

When asked to implement a feature:

1. Inspect the repository.
2. Read `README.md`, `package.json`, and relevant source files.
3. Create or update the SPEC.
4. Create a Sprint Plan.
5. Create a Contract.
6. Implement only the Contract.
7. Run available checks.
8. Create or update Evaluation.
9. Summarize changes clearly.

If the user asks for a large feature, split it into sprints before coding.

If requirements are ambiguous, make the smallest safe assumption and document it.

---

## Current Sprint Roadmap

The detailed sprint roadmap lives in:

```txt
.mcp-task/sprints/roadmap.md
```

Use that file as the operational source of truth for planned work. Keep this section as a compact orientation only.

Current sequence:

```txt
SPRINT-001 - IDE Shell Foundation - passed
SPRINT-002 - File-Backed Workspace Runtime - passed
SPRINT-003 - SPEC and Sprint Authoring Flow - planned
SPRINT-004 - Contract Builder and Gatekeeping - planned
SPRINT-005 - Agent Activity and Progress Engine - planned
SPRINT-006 - QA and Evaluation Engine - planned
SPRINT-007 - Explicit Tool Execution Harness - planned
SPRINT-008 - Local Memory and History - planned
SPRINT-009 - Packaging and CLI Foundation - planned
SPRINT-010 - MVP Hardening - planned
```

When starting any planned sprint:

1. Read `.mcp-task/sprints/roadmap.md`.
2. Read the sprint file in `.mcp-task/sprints/`.
3. Create or update the sprint Contract before implementation.
4. Implement only what the Contract allows.
5. Run QA and create/update Evaluation before marking the sprint Done.

---

## Definition of Done

A task is Done only when:

```txt
SPEC exists
Sprint exists
Contract exists
Implementation matches Contract
QA checklist passed
Evaluation score >= 90
Architecture remains clean
Offline behavior preserved
No unnecessary infrastructure added
```

If any item fails, the task is not Done.

---

## Current Product Name

Use this name in documentation and UI unless the user changes it:

```txt
MCP Harness Task Manager
```

Short name:

```txt
mcp-task
```
