export function parseArgs(argv) {
  const args = [...argv];
  const command = isOption(args[0]) || args.length === 0 ? "build" : args.shift();
  const options = {
    configPath: "bedrockc.config.json",
    debounceMs: 75
  };

  while (args.length > 0) {
    const current = args.shift();

    switch (current) {
      case "--config":
      case "-c":
        options.configPath = args.shift() ?? options.configPath;
        break;
      case "--debounce":
        options.debounceMs = Number(args.shift() ?? options.debounceMs);
        break;
      default:
        if (!isOption(current)) {
          options.configPath = current;
        }
        break;
    }
  }

  return { command, options };
}

function isOption(value) {
  return typeof value === "string" && value.startsWith("-");
}
