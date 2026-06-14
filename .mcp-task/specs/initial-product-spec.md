# MCP Harness Task Manager - Initial SPEC

## Product Vision

MCP Harness Task Manager is an offline-first, IDE-like application for managing controlled AI-assisted development sessions.

The product workflow is:

```txt
SPEC -> Contract -> Build -> QA -> Evaluation -> Done
```

The tool must become more than a prompt generator. It should behave as a lightweight harness for planning, constraining, tracking and validating AI development work through local project files.

## Target User

The first target user is the repository owner/developer working locally on software projects with AI agents.

## Core Requirements

- Work offline by default.
- Persist planning and validation artifacts in local files.
- Keep the UI close to an IDE: sidebars, document tabs, status panels and a visual terminal.
- Separate responsibilities between Planner, Contract, Builder, QA, Architect, Security and Evaluator agents.
- Require a SPEC before implementation.
- Require a Contract before sprint build work.
- Require QA and Evaluation before Done.
- Avoid databases, auth, SaaS features and paid infrastructure in the initial phase.

## Initial Local Persistence

The project must use this local structure:

```txt
.mcp-task/
  specs/
  sprints/
  contracts/
  evaluations/
  logs/
  memory/
```

Markdown should be used for human-readable files. JSON should be used for structured evaluation and future machine-readable state.

## Sprint 1 Scope

Sprint 1 establishes the base harness workspace:

- Create the `.mcp-task/` structure.
- Create the initial product SPEC.
- Create the Sprint 1 plan and contract.
- Replace the first viewport with a usable IDE-style shell.
- Include a visual terminal with simulated MCP task events.
- Keep terminal behavior visual-only.

## Out Of Scope

- Real shell execution from the browser.
- Real MCP tool calls from the browser.
- Authentication, billing, teams or SaaS behavior.
- Database setup.
- Full backend rewrite.
- Multi-project persistence runtime.

## Acceptance Summary

Sprint 1 is acceptable when a local user can open the frontend and understand the current sprint, pipeline status, contract, files, agent roles, quality checklist and visual terminal without relying on cloud services.
