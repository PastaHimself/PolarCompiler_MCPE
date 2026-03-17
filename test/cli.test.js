import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../src/cli/parseArgs.js";

test("cli parser handles command and options", () => {
  const parsed = parseArgs(["watch", "--config", "bedrockc.config.json", "--debounce", "100"]);
  assert.equal(parsed.command, "watch");
  assert.equal(parsed.options.configPath, "bedrockc.config.json");
  assert.equal(parsed.options.debounceMs, 100);
});
