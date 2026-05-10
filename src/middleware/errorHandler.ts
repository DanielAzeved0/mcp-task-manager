import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: "Route not found." });
}

export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({ error: error.issues.map((issue) => issue.message) });
    return;
  }

  const message = error instanceof Error ? error.message : "Internal server error.";
  if (message.includes("No AI backend configured") || message.includes("Backend unreachable")) {
    res.status(503).json({ error: message });
    return;
  }

  res.status(500).json({ error: message });
}
