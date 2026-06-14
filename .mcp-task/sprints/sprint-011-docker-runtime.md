# Sprint SPRINT-011 - Docker Runtime

## Linked SPEC

`.mcp-task/specs/sprint-011-docker-runtime.md`

## Goal

Make the local MCP Harness Task Manager runnable in Docker with one container exposing the API and static UI.

## Status

`passed`

## Scope

- Docker image hardening.
- Docker Compose local runtime.
- Express static file serving.
- README Docker instructions.
- Local validation commands.

## Tasks

- [ ] Replace the basic Dockerfile with a multi-stage build.
- [x] Replace the basic Dockerfile with a multi-stage build.
- [x] Add `.dockerignore`.
- [x] Add `docker-compose.yml`.
- [x] Serve `public/` from Express in production/runtime mode.
- [x] Document Docker build and run commands.
- [x] Run available validation.

## Acceptance Criteria

- Docker image builds reproducibly.
- Container runs the app on `PORT=3000`.
- UI and API are available from the same origin.
- `.mcp-task/` is bind-mounted by Compose.
- No SaaS, database or cloud dependency is introduced.
