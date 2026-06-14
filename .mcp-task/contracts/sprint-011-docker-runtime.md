# Contract - SPRINT-011 Docker Runtime

## sprint_id

`SPRINT-011`

## objective

Containerize MCP Harness Task Manager so it can run locally through Docker while preserving the offline-first file-backed architecture.

## allowed_changes

- Update `Dockerfile`.
- Add `.dockerignore`.
- Add `docker-compose.yml`.
- Update Express app startup/static serving where required for container runtime.
- Update `README.md` with Docker instructions.
- Add package scripts only if they simplify Docker usage without replacing existing scripts.
- Add SPRINT-011 local artifacts under `.mcp-task/`.

## forbidden_changes

- Do not add a database, SaaS service, cloud dependency or auth layer.
- Do not commit real secrets or generated `.env` files.
- Do not remove existing local development scripts.
- Do not change prompt generation behavior.
- Do not execute destructive shell commands from the app.

## acceptance_criteria

- The Dockerfile uses a build stage and a runtime stage.
- Runtime uses production dependencies only.
- The app serves API and static UI from one container.
- Docker Compose exposes `3000:3000`.
- Compose persists `.mcp-task/` through a local bind mount.
- README documents Docker build, run, Compose and environment usage.
- Existing TypeScript build passes.

## qa_checklist

- [ ] Inspect Dockerfile for dev dependency leakage in runtime.
- [ ] Inspect Compose port and volume mapping.
- [ ] Validate TypeScript build.
- [ ] Validate Docker build if Docker is available.
- [ ] Confirm no secrets were added.

## expected_outputs

- Docker-ready project files.
- Documented commands for local container execution.
- SPRINT-011 QA/evaluation artifacts.

## rollback_notes

Revert Dockerfile, `.dockerignore`, `docker-compose.yml`, Express static serving changes, README Docker section and SPRINT-011 artifacts.
