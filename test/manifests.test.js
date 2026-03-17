import test from "node:test";
import assert from "node:assert/strict";
import { buildBehaviorManifest } from "../src/emit/manifests/behaviorManifest.js";
import { buildResourceManifest } from "../src/emit/manifests/resourceManifest.js";

test("manifest generators emit Bedrock pack metadata", () => {
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
      scripts: []
    }
  };

  const behavior = buildBehaviorManifest(ir);
  const resource = buildResourceManifest(ir);

  assert.equal(behavior.modules[0].type, "data");
  assert.equal(resource.modules[0].type, "resources");
  assert.equal(resource.dependencies[0].uuid, "a");
});
