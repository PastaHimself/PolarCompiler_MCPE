import test from "node:test";
import assert from "node:assert/strict";
import {
  detectArchiveMode,
  detectArchiveType,
  validatePackagedArchive
} from "../src/archive/archiveService.js";

test("detectArchiveType accepts supported archive extensions", () => {
  assert.equal(detectArchiveType("addon.mcaddon"), "mcaddon");
  assert.equal(detectArchiveType("pack.mcpack"), "mcpack");
  assert.equal(detectArchiveType("project.zip"), "zip");
});

test("detectArchiveMode recognizes source archives", () => {
  const mode = detectArchiveMode([
    { path: "bedrockc.config.json", ext: ".json" },
    { path: "src/main.bca", ext: ".bca" }
  ]);

  assert.equal(mode.mode, "source-archive");
  assert.equal(mode.configPath, "bedrockc.config.json");
});

test("validatePackagedArchive reports missing manifests", () => {
  const result = validatePackagedArchive(
    [
      {
        path: "behavior_pack/items/ruby.json",
        ext: ".json",
        content: "{\"format_version\":\"1.21.100\"}",
        buffer: Buffer.from("{\"format_version\":\"1.21.100\"}")
      }
    ],
    "mcaddon"
  );

  assert.equal(result.summary.detectedType, "unsupported archive layout");
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "ARC2001"));
});

test("validatePackagedArchive classifies a single mcpack resource pack", () => {
  const manifest = {
    format_version: 2,
    header: {
      name: "RP",
      description: "Resource pack",
      uuid: "11111111-1111-1111-1111-111111111111",
      version: [1, 0, 0]
    },
    modules: [
      {
        type: "resources",
        uuid: "22222222-2222-2222-2222-222222222222",
        version: [1, 0, 0]
      }
    ]
  };

  const result = validatePackagedArchive(
    [
      {
        path: "manifest.json",
        ext: ".json",
        content: JSON.stringify(manifest),
        buffer: Buffer.from(JSON.stringify(manifest))
      }
    ],
    "mcpack"
  );

  assert.equal(result.summary.detectedType, "single pack");
});
