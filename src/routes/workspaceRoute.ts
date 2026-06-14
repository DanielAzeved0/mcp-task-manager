import type { Express, Request, Response } from "express";
import {
  buildWorkspaceSummary,
  readWorkspaceArtifact,
  recordProgressEvent,
  writeWorkspaceArtifact,
  WorkspaceArtifactError,
} from "../infra/file-system/workspaceArtifacts.js";
import {
  approveStoredCommandProposal,
  ensurePackageScriptProposals,
  executeStoredCommandProposal,
  readToolExecutionState,
  summarizeToolExecution,
} from "../infra/mcp/toolExecutionHarness.js";
import {
  buildLocalMemoryIndex,
  LocalMemoryError,
  searchLocalMemory,
  writeDecisionNote,
} from "../infra/file-system/localMemory.js";

export function registerWorkspaceRoutes(app: Express) {
  app.get("/workspace", async (req: Request, res: Response) => {
    try {
      res.json(await buildWorkspaceSummary(process.cwd()));
    } catch (error) {
      sendWorkspaceError(res, error);
    }
  });

  app.get("/workspace/artifact", async (req: Request, res: Response) => {
    try {
      const artifactPath = typeof req.query.path === "string" ? req.query.path : "";
      res.json(await readWorkspaceArtifact(process.cwd(), artifactPath));
    } catch (error) {
      sendWorkspaceError(res, error);
    }
  });

  app.post("/workspace/artifact", async (req: Request, res: Response) => {
    try {
      const artifactPath = typeof req.body?.path === "string" ? req.body.path : "";
      const specPath = typeof req.body?.specPath === "string" ? req.body.specPath : undefined;
      const response = await writeWorkspaceArtifact(process.cwd(), artifactPath, req.body?.content, specPath);
      res.json(response);
    } catch (error) {
      sendWorkspaceError(res, error);
    }
  });

  app.post("/workspace/progress/event", async (req: Request, res: Response) => {
    try {
      res.json(await recordProgressEvent(process.cwd(), req.body));
    } catch (error) {
      sendWorkspaceError(res, error);
    }
  });

  app.get("/workspace/tool-harness", async (_req: Request, res: Response) => {
    try {
      res.json(summarizeToolExecution(await readToolExecutionState(process.cwd())));
    } catch (error) {
      sendWorkspaceError(res, error);
    }
  });

  app.post("/workspace/tool-harness/proposals/package-scripts", async (_req: Request, res: Response) => {
    try {
      res.json(summarizeToolExecution(await ensurePackageScriptProposals(process.cwd())));
    } catch (error) {
      sendWorkspaceError(res, error);
    }
  });

  app.post("/workspace/tool-harness/commands/approve", async (req: Request, res: Response) => {
    try {
      const proposalId = typeof req.body?.proposalId === "string" ? req.body.proposalId : "";
      res.json(summarizeToolExecution(await approveStoredCommandProposal(process.cwd(), proposalId)));
    } catch (error) {
      sendWorkspaceError(res, error);
    }
  });

  app.post("/workspace/tool-harness/commands/execute", async (req: Request, res: Response) => {
    try {
      const proposalId = typeof req.body?.proposalId === "string" ? req.body.proposalId : "";
      res.json(summarizeToolExecution(await executeStoredCommandProposal(process.cwd(), proposalId)));
    } catch (error) {
      sendWorkspaceError(res, error);
    }
  });

  app.get("/workspace/memory", async (_req: Request, res: Response) => {
    try {
      res.json(await buildLocalMemoryIndex(process.cwd()));
    } catch (error) {
      sendWorkspaceError(res, error);
    }
  });

  app.post("/workspace/memory/search", async (req: Request, res: Response) => {
    try {
      res.json(await searchLocalMemory(process.cwd(), req.body));
    } catch (error) {
      sendWorkspaceError(res, error);
    }
  });

  app.post("/workspace/memory/decisions", async (req: Request, res: Response) => {
    try {
      res.json(await writeDecisionNote(process.cwd(), req.body));
    } catch (error) {
      sendWorkspaceError(res, error);
    }
  });
}

function sendWorkspaceError(res: Response, error: unknown) {
  if (error instanceof LocalMemoryError) {
    res.status(error.statusCode).json({
      status: "error",
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  if (error instanceof WorkspaceArtifactError) {
    res.status(error.statusCode).json({
      status: "error",
      code: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Failed to read workspace.";
  res.status(500).json({
    status: "error",
    code: "read_failed",
    message,
  });
}
