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

A static frontend workbench is available at [`web/index.html`](/c:/Users/mg4392/Downloads/temp/web/index.html). It includes source/config editing, validate/build controls, diagnostics, and Bedrock output previews. By default it uses a browser preview adapter, and it can also be wired to a real host bridge through `window.bedrockcBridge`.

## Vercel Deployment

Vercel support is included through [`vercel.json`](/c:/Users/mg4392/Downloads/temp/vercel.json) and the serverless compiler bridge at [`api/compile.js`](/c:/Users/mg4392/Downloads/temp/api/compile.js). When the workbench is served over HTTP, the frontend will call `/api/compile` first and only fall back to the browser preview adapter if the API is unavailable.

Deployment platforms such as Vercel or Render often run `npm run build` automatically. In this repo, `build` is intentionally a no-op deployment script so the platform does not try to run the compiler CLI against a missing root `bedrockc.config.json`. Use `npm run compiler:build` or `npx bedrockc build` when you want to compile an add-on project yourself.

## Project Layout

- [`src/core/compiler.js`](/c:/Users/mg4392/Downloads/temp/src/core/compiler.js): high-level compiler orchestration
- [`src/syntax/parser.js`](/c:/Users/mg4392/Downloads/temp/src/syntax/parser.js): parsing and AST construction
- [`src/semantic/analyzer.js`](/c:/Users/mg4392/Downloads/temp/src/semantic/analyzer.js): binding and validation
- [`src/emit/emitter.js`](/c:/Users/mg4392/Downloads/temp/src/emit/emitter.js): Bedrock output generation

## Status

The current v1 supports the full requested asset catalog, but advanced Bedrock schemas still flow through typed declarations plus object-literal payloads instead of fully bespoke language syntax.
