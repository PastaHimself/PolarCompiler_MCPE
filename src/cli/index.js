#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { formatDiagnostics } from "./formatDiagnostics.js";
import { parseArgs } from "./parseArgs.js";
import { runBuildCommand } from "./commands/build.js";
import { runCompileCommand } from "./commands/compile.js";
import { runValidateCommand } from "./commands/validate.js";
import { runWatchCommand } from "./commands/watch.js";

const commandMap = {
  build: runBuildCommand,
  compile: runCompileCommand,
  validate: runValidateCommand
};

async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (command === "watch") {
    await runWatchCommand(options, printResult);
    return;
  }

  const handler = commandMap[command];
  if (!handler) {
    process.stderr.write(`Unknown command '${command}'.\n`);
    process.exitCode = 1;
    return;
  }

  const result = await handler(options);
  printResult(result);
  process.exitCode = result.success ? 0 : 1;
}

function printResult(result) {
  if (result.diagnostics.length > 0) {
    process.stderr.write(`${formatDiagnostics(result.diagnostics)}\n`);
  }

  if (result.success && result.writeResult) {
    process.stdout.write(`Wrote ${result.writeResult.files.length} files.\n`);
  } else if (result.success) {
    process.stdout.write("Validation succeeded.\n");
  }
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)).toLowerCase() ===
    path.resolve(process.argv[1]).toLowerCase();
if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}

export { main };
