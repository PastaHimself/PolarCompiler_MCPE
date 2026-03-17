import { formatDiagnostic } from "../diagnostics/format.js";
import { createWatchService } from "../fs/watchService.js";
import { IncrementalState } from "./incrementalState.js";
import { compileProject } from "./compileProject.js";

export class BedrockCompiler {
  constructor() {
    this.incrementalState = new IncrementalState();
  }

  async build(options = {}) {
    return compileProject({
      ...options,
      write: true,
      incrementalState: this.incrementalState
    });
  }

  async validate(options = {}) {
    return compileProject({
      ...options,
      write: false,
      incrementalState: this.incrementalState
    });
  }

  async watch({ configPath = "bedrockc.config.json", debounceMs = 75, onResult } = {}) {
    const run = async () => {
      const result = await this.build({ configPath });
      if (onResult) {
        await onResult(result);
      }
      return result;
    };

    await run();

    return createWatchService({
      paths: [configPath],
      rootDir: this.incrementalState.lastResult?.config?.paths.srcDir,
      debounceMs,
      onChange: run
    });
  }

  static formatDiagnostics(diagnostics) {
    return diagnostics.map((diagnostic) => formatDiagnostic(diagnostic)).join("\n");
  }
}
