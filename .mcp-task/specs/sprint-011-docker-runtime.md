# SPEC - SPRINT-011 Docker Runtime

## Goal

Run MCP Harness Task Manager from a Docker container with the backend API and static UI available through a single exposed port.

## Scope

- Provide a production Docker image for the local app.
- Serve `public/` from the Express backend after build.
- Add Docker Compose for local container startup.
- Preserve file-backed `.mcp-task/` persistence through a bind mount.
- Document build, run and validation commands.

## Requirements

- The container must build from the existing Node/TypeScript project.
- The runtime image must not require dev dependencies.
- The app must listen on `PORT`, defaulting to `3000`.
- The UI must be reachable at `http://localhost:3000`.
- The API health endpoint must be reachable at `/health`.
- No secrets may be committed.

## Acceptance Criteria

- `docker build -t mcp-task .` can build the image.
- `docker compose up --build` can start the app on port `3000`.
- `GET /health` works from the running container.
- `.mcp-task/` remains local-file backed through Docker Compose.
- README includes Docker usage and environment guidance.
