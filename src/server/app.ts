import express from "express";
import cors from "cors";
import path from "node:path";
import { registerPromptToSpecRoute } from "../routes/promptToSpecRoute.js";
import { registerHealthRoutes } from "../routes/healthRoute.js";
import { registerWorkspaceRoutes } from "../routes/workspaceRoute.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  registerPromptToSpecRoute(app);
  registerHealthRoutes(app);
  registerWorkspaceRoutes(app);

  app.use(express.static(path.resolve(process.cwd(), "public")));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
