#!/usr/bin/env node
import { CliError, formatCliError, parseCliCommand, runCliCommand } from "./cliCore.js";

async function main(argv: string[]) {
  let command;

  try {
    command = parseCliCommand(argv.slice(2));
  } catch (error) {
    const cliError = error instanceof CliError ? error : new CliError("unknown_command", "Unable to parse command.", 2);
    process.stderr.write(formatCliError(cliError));
    process.exitCode = cliError.exitCode;
    return;
  }

  if (command.name === "start") {
    process.stdout.write("mcp-task start\n\nStarting local MCP Harness server...\n");
    const [{ createApp }, { startServer }] = await Promise.all([import("../server/app.js"), import("../server/startServer.js")]);
    await startServer(createApp());
    return;
  }

  const result = await runCliCommand(command);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}

main(process.argv).catch((error) => {
  process.stderr.write(formatCliError(new CliError("start_failed", error instanceof Error ? error.message : String(error), 1)));
  process.exitCode = 1;
});
