import test from "node:test";
import assert from "node:assert/strict";
import { emitAddonProject } from "../src/emit/emitter.js";

test("emitter produces manifest and content files", () => {
  const ir = {
    metadata: {
      slug: "hello-addon",
      version: [1, 0, 0],
      minEngineVersion: [1, 21, 100],
      packs: {
        behavior: {
          name: "Hello BP",
          description: "Behavior pack",
          headerUuid: "a",
          moduleUuid: "b"
        },
        resource: {
          name: "Hello RP",
          description: "Resource pack",
          headerUuid: "c",
          moduleUuid: "d"
        }
      },
      scripts: {
        enabled: false,
        modules: []
      }
    },
    behaviorPack: {
      items: [{ path: "items/ruby.json", json: { foo: "bar" } }],
      blocks: [],
      entities: [],
      recipes: [],
      lootTables: [],
      functions: [{ path: "give_ruby.mcfunction", lines: ["say hi"] }],
      spawnRules: [],
      scripts: []
    },
    resourcePack: {
      itemTextures: [{ key: "ruby", path: "textures/items/ruby" }],
      blockTextures: [],
      itemDefinitions: [],
      blockDefinitions: [],
      entities: [],
      animations: [],
      animationControllers: [],
      localization: new Map([["en_US", { "item.demo.ruby.name": "Ruby" }]])
    }
  };

  const files = emitAddonProject(ir).entries().map(([file]) => file);

  assert.ok(files.includes("behavior_pack/manifest.json"));
  assert.ok(files.includes("behavior_pack/items/items/ruby.json") === false);
  assert.ok(files.includes("behavior_pack/items/ruby.json"));
  assert.ok(files.includes("behavior_pack/functions/give_ruby.mcfunction"));
  assert.ok(files.includes("resource_pack/textures/item_texture.json"));
});
