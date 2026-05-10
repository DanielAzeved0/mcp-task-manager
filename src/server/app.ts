import express from "express";
import cors from "cors";
import { registerPromptToSpecRoute } from "../routes/promptToSpecRoute.js";
import { registerHealthRoutes } from "../routes/healthRoute.js";
import { errorHandler, notFoundHandler } from "../middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  registerPromptToSpecRoute(app);
  registerHealthRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
