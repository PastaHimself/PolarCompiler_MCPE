import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { normalizeConfig } from "../src/config/normalizeConfig.js";
import { buildProjectGraph } from "../src/core/projectGraph.js";
import { analyzeProject } from "../src/semantic/analyzer.js";

test("semantic analysis reports missing addon declarations", async () => {
  const config = normalizeConfig(
    {
      entry: "./src/main.bca",
      srcDir: "./src",
      outDir: "./dist",
      project: {
        slug: "semantic-fixture",
        namespace: "demo",
        version: [1, 0, 0],
        target: "1.21.100"
      }
    },
    path.resolve("test/fixtures/hello-addon/bedrockc.config.json")
  );

  const graph = await buildProjectGraph(config);
  const analysis = analyzeProject(graph, config);

  assert.equal(analysis.hasErrors, false);
});
