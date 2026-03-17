import { loadConfig } from "../config/loadConfig.js";
import { emitAddonProject } from "../emit/emitter.js";
import { writeOutputPlan } from "../fs/outputWriter.js";
import { lowerToIr } from "../ir/lowerToIr.js";
import { analyzeProject } from "../semantic/analyzer.js";
import { buildProjectGraph } from "./projectGraph.js";
import { createOutputPlan } from "./outputPlan.js";

export async function compileProject({
  configPath = "bedrockc.config.json",
  write = false,
  incrementalState = null
} = {}) {
  const loaded = await loadConfig(configPath);
  if (!loaded.config) {
    return {
      success: false,
      diagnostics: loaded.diagnostics
    };
  }

  const graph = await buildProjectGraph(loaded.config, incrementalState);
  const analysis = analyzeProject(graph, loaded.config);

  if (analysis.hasErrors) {
    if (incrementalState) {
      incrementalState.moduleCache = graph.moduleCache;
      incrementalState.lastResult = {
        success: false,
        config: loaded.config,
        graph,
        analysis,
        diagnostics: analysis.diagnostics
      };
    }

    return {
      success: false,
      config: loaded.config,
      graph,
      analysis,
      diagnostics: analysis.diagnostics
    };
  }

  const ir = lowerToIr(analysis);
  const virtualFiles = emitAddonProject(ir);
  const outputPlan = createOutputPlan(loaded.config, virtualFiles);
  const writeResult = write ? await writeOutputPlan(outputPlan) : null;

  const result = {
    success: true,
    config: loaded.config,
    graph,
    analysis,
    ir,
    virtualFiles,
    outputPlan,
    writeResult,
    diagnostics: analysis.diagnostics
  };

  if (incrementalState) {
    incrementalState.moduleCache = graph.moduleCache;
    incrementalState.lastResult = result;
  }

  return result;
}
