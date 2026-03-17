import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compileProject } from "../src/core/compileProject.js";

test("example project compiles to the expected Bedrock output", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bedrockc-"));
  const fixtureRoot = path.resolve("examples/hello-addon");
  const projectRoot = path.join(tempRoot, "hello-addon");
  await fs.cp(fixtureRoot, projectRoot, { recursive: true });

  const configPath = path.join(projectRoot, "bedrockc.config.json");
  const result = await compileProject({ configPath, write: true });
  assert.equal(result.success, true);

  const pairs = [
    ["dist/behavior_pack/manifest.json", "expected/behavior_pack/manifest.json"],
    ["dist/behavior_pack/items/ruby.json", "expected/behavior_pack/items/ruby.json"],
    ["dist/behavior_pack/functions/give_ruby.mcfunction", "expected/behavior_pack/functions/give_ruby.mcfunction"],
    ["dist/resource_pack/manifest.json", "expected/resource_pack/manifest.json"],
    ["dist/resource_pack/textures/item_texture.json", "expected/resource_pack/textures/item_texture.json"],
    ["dist/resource_pack/texts/en_US.lang", "expected/resource_pack/texts/en_US.lang"],
    ["dist/resource_pack/texts/languages.json", "expected/resource_pack/texts/languages.json"]
  ];

  for (const [actualRelative, expectedRelative] of pairs) {
    const actual = await fs.readFile(path.join(projectRoot, actualRelative), "utf8");
    const expected = await fs.readFile(path.join(projectRoot, expectedRelative), "utf8");
    assert.equal(actual, expected, actualRelative);
  }
});
