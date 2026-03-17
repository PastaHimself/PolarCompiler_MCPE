import { BedrockCompiler } from "../../core/compiler.js";

export async function runValidateCommand(options) {
  const compiler = new BedrockCompiler();
  return compiler.validate(options);
}
