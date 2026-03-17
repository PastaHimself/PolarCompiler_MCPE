import { BedrockCompiler } from "../../core/compiler.js";

export async function runBuildCommand(options) {
  const compiler = new BedrockCompiler();
  return compiler.build(options);
}
