import { BedrockCompiler } from "../../core/compiler.js";

export async function runWatchCommand(options, onResult) {
  const compiler = new BedrockCompiler();
  return compiler.watch({
    ...options,
    onResult
  });
}
