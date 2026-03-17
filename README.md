# bedrockc

`bedrockc` is a Node.js ESM compiler and CLI for turning a custom `.bca` source language into a Minecraft Bedrock add-on project with separate behavior and resource packs.

## Features

- Handwritten lexer and recursive-descent parser
- Structured diagnostics with file, line, and column information
- Whole-project semantic analysis with strict cross-resource references
- Deterministic manifest and JSON generation
- Separate behavior pack and resource pack emitters
- `build`, `compile`, `validate`, and `watch` CLI commands
- Built-in example project and `node:test` coverage for critical subsystems

## Install and Run

```bash
npm install
npm run compile -- --config ./examples/hello-addon/bedrockc.config.json
```

## Source Language

```bca
import "./content/items.bca";

addon hello {
  namespace: "demo";
  version: [1, 0, 0];
}

item ruby {
  id: "demo:ruby";
  icon: "ruby";
  texture: "textures/items/ruby";
  display_name: "item.demo.ruby.name";
  components: {
    "minecraft:max_stack_size": 64
  };
}

function give_ruby {
  path: "give_ruby";
  body: ["give @s demo:ruby 1"];
}

locale en_US {
  "item.demo.ruby.name": "Ruby";
}
```

## Configuration

`bedrockc` loads `bedrockc.config.json` by default.

```json
{
  "entry": "./src/main.bca",
  "srcDir": "./src",
  "outDir": "./dist",
  "project": {
    "slug": "hello-addon",
    "namespace": "demo",
    "version": [1, 0, 0],
    "target": "1.21.100"
  },
  "packs": {
    "behavior": {
      "name": "Hello BP",
      "description": "Behavior pack"
    },
    "resource": {
      "name": "Hello RP",
      "description": "Resource pack"
    }
  },
  "scripts": {
    "enabled": false,
    "modules": []
  }
}
```

## CLI

```bash
npx bedrockc build --config ./bedrockc.config.json
npx bedrockc validate --config ./bedrockc.config.json
npx bedrockc watch --config ./bedrockc.config.json --debounce 75
```

```bash
npm run compiler:build -- --config ./bedrockc.config.json
npm run compiler:validate -- --config ./bedrockc.config.json
npm run compiler:watch -- --config ./bedrockc.config.json --debounce 75
```

## Web Workbench

A static frontend workbench is available at [`web/index.html`](/c:/Users/mg4392/Downloads/temp/web/index.html). It now supports two workflows:

- `Editor` mode for `.bca` source and config editing with compiler output previews
- `Upload` mode for `.mcaddon`, `.mcpack`, and `.zip` archive analysis with diagnostics, unpacked file previews, and generated output when the upload is a bedrockc source project

Packaged `.mcaddon`, `.mcpack`, and packaged `.zip` uploads are analyzed directly in the browser so public Vercel deployments do not fail on request-size limits. Source-project archives still use the compiler bridge when possible, and fall back to a browser preview if the public upload request is rejected.

Upload mode now also supports in-browser editing for supported text files, browser-side Bedrock script validation, and an upload watch toggle that automatically reruns archive analysis after file edits or reverts. Script checks run against bundled Bedrock API typings, edited files stay local to the current browser session, and the workbench can download a patched archive after reanalysis.

## Vercel Deployment

Vercel support is included through [`vercel.json`](/c:/Users/mg4392/Downloads/temp/vercel.json), the serverless compiler bridge at [`api/compile.js`](/c:/Users/mg4392/Downloads/temp/api/compile.js), and the deployment build script [`scripts/prepare-public.js`](/c:/Users/mg4392/Downloads/temp/scripts/prepare-public.js). The `build` script copies [`web/`](/c:/Users/mg4392/Downloads/temp/web) into a generated `public/` directory so Vercel has an explicit static output directory, while the frontend calls `/api/compile` for real compiler runs.

Archive upload support is exposed through [`api/archive.js`](/c:/Users/mg4392/Downloads/temp/api/archive.js). The upload API accepts `multipart/form-data` with a single `archive` file and supports `.mcaddon`, `.mcpack`, and `.zip`.

Deployment platforms such as Vercel or Render often run `npm run build` automatically. In this repo, `build` is the deployment packaging step only. Use `npm run compiler:build` or `npx bedrockc build` when you want to compile an add-on project yourself.

## Project Layout

- [`src/core/compiler.js`](/c:/Users/mg4392/Downloads/temp/src/core/compiler.js): high-level compiler orchestration
- [`src/syntax/parser.js`](/c:/Users/mg4392/Downloads/temp/src/syntax/parser.js): parsing and AST construction
- [`src/semantic/analyzer.js`](/c:/Users/mg4392/Downloads/temp/src/semantic/analyzer.js): binding and validation
- [`src/emit/emitter.js`](/c:/Users/mg4392/Downloads/temp/src/emit/emitter.js): Bedrock output generation

## Status

The current v1 supports the full requested asset catalog, but advanced Bedrock schemas still flow through typed declarations plus object-literal payloads instead of fully bespoke language syntax.
