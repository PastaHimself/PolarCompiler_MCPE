const STORAGE_KEYS = {
  source: "bedrockc.workbench.source",
  config: "bedrockc.workbench.config"
};

const SAMPLE_SOURCE = `addon hello {
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
}`;

const SAMPLE_CONFIG = `{
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
}`;

const editorFiles = [
  { path: "src/main.bca", label: "main.bca", storageKey: STORAGE_KEYS.source },
  { path: "bedrockc.config.json", label: "bedrockc.config.json", storageKey: STORAGE_KEYS.config }
];

const elements = {
  bridgePill: document.querySelector("#bridge-pill"),
  runStatePill: document.querySelector("#run-state-pill"),
  editorFileList: document.querySelector("#editor-file-list"),
  editorTabs: document.querySelector("#editor-tabs"),
  textarea: document.querySelector("#editor-textarea"),
  targetVersion: document.querySelector("#target-version"),
  metricDiagnostics: document.querySelector("#metric-diagnostics"),
  metricOutputs: document.querySelector("#metric-outputs"),
  metricDuration: document.querySelector("#metric-duration"),
  lastCommand: document.querySelector("#last-command"),
  bridgeMode: document.querySelector("#bridge-mode"),
  watchState: document.querySelector("#watch-state"),
  diagnosticList: document.querySelector("#diagnostic-list"),
  outputFileList: document.querySelector("#output-file-list"),
  activeOutputName: document.querySelector("#active-output-name"),
  activeOutputKind: document.querySelector("#active-output-kind"),
  outputContent: document.querySelector("#output-content"),
  validateButton: document.querySelector("#validate-button"),
  buildButton: document.querySelector("#build-button"),
  watchButton: document.querySelector("#watch-button"),
  resetButton: document.querySelector("#reset-button"),
  copyOutputButton: document.querySelector("#copy-output-button")
};

const compilerBridge = createCompilerBridge();
const state = {
  files: {
    "src/main.bca": loadStoredValue(STORAGE_KEYS.source, SAMPLE_SOURCE),
    "bedrockc.config.json": loadStoredValue(STORAGE_KEYS.config, SAMPLE_CONFIG)
  },
  activeEditorFile: "src/main.bca",
  outputs: [],
  activeOutputPath: null,
  diagnostics: [],
  watchEnabled: false,
  running: false,
  lastDurationMs: 0,
  lastCommand: "Not run yet"
};

let watchTimer = null;

initialize();

function initialize() {
  elements.bridgePill.textContent = `Bridge: ${compilerBridge.label}`;
  elements.bridgeMode.textContent = compilerBridge.label;

  renderEditorFileButtons();
  renderEditorTabs();
  renderEditor();
  syncConfigMeta();
  renderDiagnostics();
  renderOutputs();
  renderRunState("Idle", "status-idle");
  attachEvents();
  void runCommand("build");
}

function attachEvents() {
  elements.textarea.addEventListener("input", (event) => {
    state.files[state.activeEditorFile] = event.target.value;
    persistCurrentEditor();
    syncConfigMeta();
    if (state.watchEnabled) {
      scheduleWatchBuild();
    }
  });

  elements.validateButton.addEventListener("click", () => void runCommand("validate"));
  elements.buildButton.addEventListener("click", () => void runCommand("build"));
  elements.resetButton.addEventListener("click", resetSample);
  elements.watchButton.addEventListener("click", toggleWatch);
  elements.copyOutputButton.addEventListener("click", () => void copyActiveOutput());
}

async function runCommand(command, fromWatch = false) {
  if (state.running) {
    return;
  }

  state.running = true;
  state.lastCommand = fromWatch ? "Watch rebuild" : capitalize(command);
  elements.lastCommand.textContent = state.lastCommand;
  renderRunState("Running", "status-running");

  try {
    const payload = {
      command,
      files: structuredClone(state.files)
    };
    const rawResult = await compilerBridge[command](payload);
    const result = normalizeBridgeResult(rawResult);

    state.diagnostics = result.diagnostics;
    state.outputs = result.outputs;
    state.lastDurationMs = result.durationMs;

    if (!state.activeOutputPath || !state.outputs.some((output) => output.path === state.activeOutputPath)) {
      state.activeOutputPath = state.outputs[0]?.path ?? null;
    }

    renderDiagnostics();
    renderOutputs();
    renderMetrics(result);

    const statusClass = hasErrors(result.diagnostics) ? "status-error" : "status-success";
    const statusText = hasErrors(result.diagnostics) ? "Needs fixes" : "Ready";
    renderRunState(statusText, statusClass);
  } catch (error) {
    state.diagnostics = [
      {
        severity: "error",
        code: "UI9001",
        message: error.message ?? "Unexpected workbench failure.",
        file: "workbench",
        line: 1,
        column: 1
      }
    ];
    state.outputs = [];
    renderDiagnostics();
    renderOutputs();
    renderMetrics({ diagnostics: state.diagnostics, outputs: [], durationMs: 0 });
    renderRunState("Failed", "status-error");
  } finally {
    state.running = false;
  }
}

function normalizeBridgeResult(result) {
  const diagnostics = Array.isArray(result?.diagnostics) ? result.diagnostics : [];
  const outputs = normalizeOutputs(result?.outputs);

  return {
    diagnostics,
    outputs,
    durationMs: Math.round(Number(result?.durationMs ?? 0))
  };
}

function normalizeOutputs(outputs) {
  if (Array.isArray(outputs)) {
    return outputs.map((output) => ({
      path: output.path,
      kind: output.kind ?? inferOutputKind(output.path),
      content: output.content ?? ""
    }));
  }

  if (outputs && typeof outputs === "object") {
    return Object.entries(outputs).map(([path, content]) => ({
      path,
      kind: inferOutputKind(path),
      content: typeof content === "string" ? content : JSON.stringify(content, null, 2)
    }));
  }

  return [];
}

function renderEditorFileButtons() {
  elements.editorFileList.innerHTML = "";

  for (const file of editorFiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `file-button${file.path === state.activeEditorFile ? " is-active" : ""}`;
    button.textContent = file.path;
    button.addEventListener("click", () => {
      state.activeEditorFile = file.path;
      renderEditorFileButtons();
      renderEditorTabs();
      renderEditor();
    });
    elements.editorFileList.append(button);
  }
}

function renderEditorTabs() {
  elements.editorTabs.innerHTML = "";

  for (const file of editorFiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${file.path === state.activeEditorFile ? " is-active" : ""}`;
    button.textContent = file.label;
    button.addEventListener("click", () => {
      state.activeEditorFile = file.path;
      renderEditorFileButtons();
      renderEditorTabs();
      renderEditor();
    });
    elements.editorTabs.append(button);
  }
}

function renderEditor() {
  elements.textarea.value = state.files[state.activeEditorFile];
}

function renderDiagnostics() {
  elements.diagnosticList.innerHTML = "";

  const diagnostics = state.diagnostics.length > 0
    ? state.diagnostics
    : [
        {
          severity: "success",
          code: "UI0000",
          message: "No diagnostics. The current project shape is ready for emission.",
          file: "compiler",
          line: 1,
          column: 1
        }
      ];

  for (const diagnostic of diagnostics) {
    const item = document.createElement("article");
    item.className = `diagnostic-item is-${diagnostic.severity}`;
    item.innerHTML = `
      <strong>${diagnostic.severity.toUpperCase()} ${diagnostic.code}</strong>
      <p>${escapeHtml(diagnostic.message)}</p>
      <p>${escapeHtml(formatLocation(diagnostic))}</p>
    `;
    elements.diagnosticList.append(item);
  }
}

function renderOutputs() {
  elements.outputFileList.innerHTML = "";

  if (state.outputs.length === 0) {
    elements.activeOutputName.textContent = "No output selected";
    elements.activeOutputKind.textContent = "Text";
    elements.outputContent.textContent = "Run a successful build to preview generated Bedrock files.";
    return;
  }

  for (const output of state.outputs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `output-button${output.path === state.activeOutputPath ? " is-active" : ""}`;
    button.textContent = output.path;
    button.addEventListener("click", () => {
      state.activeOutputPath = output.path;
      renderOutputs();
    });
    elements.outputFileList.append(button);
  }

  const activeOutput = state.outputs.find((output) => output.path === state.activeOutputPath) ?? state.outputs[0];
  state.activeOutputPath = activeOutput.path;
  elements.activeOutputName.textContent = activeOutput.path;
  elements.activeOutputKind.textContent = activeOutput.kind.toUpperCase();
  elements.outputContent.textContent = activeOutput.content;
}

function renderMetrics(result) {
  elements.metricDiagnostics.textContent = `${result.diagnostics.filter((item) => item.severity !== "success").length}`;
  elements.metricOutputs.textContent = `${result.outputs.length}`;
  elements.metricDuration.textContent = `${result.durationMs}ms`;
}

function renderRunState(label, className) {
  elements.runStatePill.textContent = label;
  elements.runStatePill.className = `status-pill ${className}`;
}

function toggleWatch() {
  state.watchEnabled = !state.watchEnabled;
  elements.watchButton.classList.toggle("is-toggled", state.watchEnabled);
  elements.watchButton.textContent = state.watchEnabled ? "Watch On" : "Watch Off";
  elements.watchState.textContent = state.watchEnabled ? "Enabled" : "Disabled";

  if (state.watchEnabled) {
    scheduleWatchBuild();
  } else if (watchTimer) {
    clearTimeout(watchTimer);
  }
}

function scheduleWatchBuild() {
  if (watchTimer) {
    clearTimeout(watchTimer);
  }
  watchTimer = setTimeout(() => {
    void runCommand("build", true);
  }, 600);
}

function resetSample() {
  state.files["src/main.bca"] = SAMPLE_SOURCE;
  state.files["bedrockc.config.json"] = SAMPLE_CONFIG;
  localStorage.removeItem(STORAGE_KEYS.source);
  localStorage.removeItem(STORAGE_KEYS.config);
  syncConfigMeta();
  renderEditor();
  void runCommand("build");
}

async function copyActiveOutput() {
  const activeOutput = state.outputs.find((output) => output.path === state.activeOutputPath);
  if (!activeOutput) {
    return;
  }

  try {
    await navigator.clipboard.writeText(activeOutput.content);
    const original = elements.copyOutputButton.textContent;
    elements.copyOutputButton.textContent = "Copied";
    setTimeout(() => {
      elements.copyOutputButton.textContent = original;
    }, 1200);
  } catch {
    elements.copyOutputButton.textContent = "Clipboard unavailable";
    setTimeout(() => {
      elements.copyOutputButton.textContent = "Copy File";
    }, 1200);
  }
}

function persistCurrentEditor() {
  const entry = editorFiles.find((file) => file.path === state.activeEditorFile);
  if (!entry?.storageKey) {
    return;
  }
  localStorage.setItem(entry.storageKey, state.files[state.activeEditorFile]);
}

function syncConfigMeta() {
  try {
    const config = JSON.parse(state.files["bedrockc.config.json"]);
    elements.targetVersion.textContent = config.project?.target ?? "Unknown";
  } catch {
    elements.targetVersion.textContent = "Invalid config";
  }
}

function createCompilerBridge() {
  if (globalThis.bedrockcBridge && typeof globalThis.bedrockcBridge.build === "function") {
    return {
      label: "Host Bridge",
      validate: (payload) =>
        typeof globalThis.bedrockcBridge.validate === "function"
          ? globalThis.bedrockcBridge.validate(payload)
          : globalThis.bedrockcBridge.build(payload),
      build: (payload) => globalThis.bedrockcBridge.build(payload)
    };
  }

  return {
    label: "Browser Preview",
    validate: (payload) => runPreviewCompilation(payload, "validate"),
    build: (payload) => runPreviewCompilation(payload, "build")
  };
}

async function runPreviewCompilation(payload, command) {
  const startedAt = performance.now();
  await delay(command === "build" ? 260 : 180);

  const diagnostics = [];
  let config = null;

  try {
    config = JSON.parse(payload.files["bedrockc.config.json"]);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "CFG1001",
      message: `Invalid JSON config: ${error.message}`,
      file: "bedrockc.config.json",
      line: 1,
      column: 1
    });
  }

  const sourceText = payload.files["src/main.bca"] ?? "";
  const declarations = extractDeclarations(sourceText);
  const addonDeclaration = declarations.find((declaration) => declaration.kind === "addon");

  if (!addonDeclaration) {
    diagnostics.push({
      severity: "error",
      code: "BCA2003",
      message: "Exactly one 'addon' declaration is required.",
      file: "src/main.bca",
      line: 1,
      column: 1
    });
  }

  if (declarations.filter((declaration) => declaration.kind === "addon").length > 1) {
    diagnostics.push({
      severity: "error",
      code: "BCA2004",
      message: "Only one 'addon' declaration is allowed.",
      file: "src/main.bca",
      line: addonDeclaration?.line ?? 1,
      column: 1
    });
  }

  const itemDeclarations = declarations.filter((declaration) => declaration.kind === "item");
  if (itemDeclarations.length === 0) {
    diagnostics.push({
      severity: "warning",
      code: "BCA3101",
      message: "No item declarations found. The build will only emit pack metadata.",
      file: "src/main.bca",
      line: 1,
      column: 1
    });
  }

  const metadata = deriveMetadata(config, addonDeclaration);
  if (!metadata.namespace || !/^[a-z0-9_][a-z0-9_.-]*$/.test(metadata.namespace)) {
    diagnostics.push({
      severity: "error",
      code: "BCA3001",
      message: "Addon namespace must contain lowercase letters, digits, underscores, dots, or hyphens.",
      file: "src/main.bca",
      line: addonDeclaration?.line ?? 1,
      column: 1
    });
  }

  const outputs = hasErrors(diagnostics)
    ? []
    : buildPreviewOutputs({ metadata, declarations, config });

  return {
    diagnostics,
    outputs,
    durationMs: performance.now() - startedAt
  };
}

function deriveMetadata(config, addonDeclaration) {
  const addonFields = addonDeclaration?.members ?? {};
  const slug = config?.project?.slug ?? "hello-addon";
  const version = asVersion(addonFields.version ?? config?.project?.version ?? [1, 0, 0]);
  const target = config?.project?.target ?? "1.21.100";
  const minEngineVersion = asVersion(config?.project?.minEngineVersion ?? versionFromTarget(target));

  return {
    slug,
    namespace: addonFields.namespace ?? config?.project?.namespace ?? "demo",
    version,
    target,
    minEngineVersion,
    behaviorPack: {
      name: config?.packs?.behavior?.name ?? "Behavior Pack",
      description: config?.packs?.behavior?.description ?? "Generated by bedrockc",
      headerUuid: createSeededUuid(`${slug}:behavior:header`),
      moduleUuid: createSeededUuid(`${slug}:behavior:module`)
    },
    resourcePack: {
      name: config?.packs?.resource?.name ?? "Resource Pack",
      description: config?.packs?.resource?.description ?? "Generated by bedrockc",
      headerUuid: createSeededUuid(`${slug}:resource:header`),
      moduleUuid: createSeededUuid(`${slug}:resource:module`)
    }
  };
}

function buildPreviewOutputs({ metadata, declarations, config }) {
  const outputs = [];
  const itemTextures = {};
  const locales = new Map();

  outputs.push({
    path: "behavior_pack/manifest.json",
    kind: "json",
    content: stableJson({
      format_version: 2,
      header: {
        name: metadata.behaviorPack.name,
        description: metadata.behaviorPack.description,
        uuid: metadata.behaviorPack.headerUuid,
        version: metadata.version,
        min_engine_version: metadata.minEngineVersion
      },
      modules: [
        {
          type: "data",
          uuid: metadata.behaviorPack.moduleUuid,
          version: metadata.version
        }
      ]
    })
  });

  outputs.push({
    path: "resource_pack/manifest.json",
    kind: "json",
    content: stableJson({
      format_version: 2,
      header: {
        name: metadata.resourcePack.name,
        description: metadata.resourcePack.description,
        uuid: metadata.resourcePack.headerUuid,
        version: metadata.version,
        min_engine_version: metadata.minEngineVersion
      },
      modules: [
        {
          type: "resources",
          uuid: metadata.resourcePack.moduleUuid,
          version: metadata.version
        }
      ],
      dependencies: [
        {
          uuid: metadata.behaviorPack.headerUuid,
          version: metadata.version
        }
      ]
    })
  });

  for (const declaration of declarations) {
    switch (declaration.kind) {
      case "item": {
        const itemId = declaration.members.id ?? `${metadata.namespace}:${declaration.name}`;
        const itemPath = declaration.members.path ?? declaration.name;
        const itemJson = declaration.members.data && isObject(declaration.members.data)
          ? withFormatVersion(declaration.members.data, metadata.target)
          : {
              format_version: metadata.target,
              "minecraft:item": {
                description: {
                  identifier: itemId
                },
                components: declaration.members.components ?? {}
              }
            };

        outputs.push({
          path: `behavior_pack/items/${itemPath}.json`,
          kind: "json",
          content: stableJson(itemJson)
        });

        if (declaration.members.icon || declaration.members.texture) {
          itemTextures[declaration.members.icon ?? declaration.name] = {
            textures: declaration.members.texture ?? `textures/items/${declaration.name}`
          };
        }
        break;
      }
      case "block": {
        const blockId = declaration.members.id ?? `${metadata.namespace}:${declaration.name}`;
        const blockPath = declaration.members.path ?? declaration.name;
        const blockJson = declaration.members.data && isObject(declaration.members.data)
          ? withFormatVersion(declaration.members.data, metadata.target)
          : {
              format_version: metadata.target,
              "minecraft:block": {
                description: {
                  identifier: blockId
                },
                components: declaration.members.components ?? {}
              }
            };

        outputs.push({
          path: `behavior_pack/blocks/${blockPath}.json`,
          kind: "json",
          content: stableJson(blockJson)
        });
        break;
      }
      case "entity": {
        const entityId = declaration.members.id ?? `${metadata.namespace}:${declaration.name}`;
        const entityPath = declaration.members.path ?? declaration.name;

        outputs.push({
          path: `behavior_pack/entities/${entityPath}.json`,
          kind: "json",
          content: stableJson(
            declaration.members.server && isObject(declaration.members.server)
              ? withFormatVersion(declaration.members.server, metadata.target)
              : {
                  format_version: metadata.target,
                  "minecraft:entity": {
                    description: {
                      identifier: entityId,
                      is_spawnable: false,
                      is_summonable: true
                    },
                    components: declaration.members.components ?? {}
                  }
                }
          )
        });

        outputs.push({
          path: `resource_pack/entity/${entityPath}.entity.json`,
          kind: "json",
          content: stableJson(
            declaration.members.client && isObject(declaration.members.client)
              ? withFormatVersion(declaration.members.client, metadata.target)
              : {
                  format_version: metadata.target,
                  "minecraft:client_entity": {
                    description: {
                      identifier: entityId,
                      textures: declaration.members.texture ? { default: declaration.members.texture } : {}
                    }
                  }
                }
          )
        });
        break;
      }
      case "function": {
        const pathName = declaration.members.path ?? declaration.name;
        const lines = Array.isArray(declaration.members.body) ? declaration.members.body : [];
        outputs.push({
          path: `behavior_pack/functions/${pathName}.mcfunction`,
          kind: "text",
          content: `${lines.join("\n")}\n`
        });
        break;
      }
      case "recipe": {
        if (isObject(declaration.members.data)) {
          outputs.push({
            path: `behavior_pack/recipes/${declaration.members.path ?? declaration.name}.json`,
            kind: "json",
            content: stableJson(withFormatVersion(declaration.members.data, metadata.target))
          });
        }
        break;
      }
      case "loot_table": {
        if (isObject(declaration.members.data)) {
          outputs.push({
            path: `behavior_pack/${declaration.members.path ?? `loot_tables/${declaration.name}`}.json`,
            kind: "json",
            content: stableJson(declaration.members.data)
          });
        }
        break;
      }
      case "spawn_rule": {
        if (isObject(declaration.members.data)) {
          outputs.push({
            path: `behavior_pack/spawn_rules/${declaration.members.path ?? declaration.name}.json`,
            kind: "json",
            content: stableJson(withFormatVersion(declaration.members.data, metadata.target))
          });
        }
        break;
      }
      case "animation": {
        if (isObject(declaration.members.data)) {
          outputs.push({
            path: `resource_pack/animations/${declaration.members.path ?? declaration.name}.json`,
            kind: "json",
            content: stableJson(withFormatVersion(declaration.members.data, metadata.target))
          });
        }
        break;
      }
      case "animation_controller": {
        if (isObject(declaration.members.data)) {
          outputs.push({
            path: `resource_pack/animation_controllers/${declaration.members.path ?? declaration.name}.json`,
            kind: "json",
            content: stableJson(withFormatVersion(declaration.members.data, metadata.target))
          });
        }
        break;
      }
      case "locale": {
        locales.set(declaration.name, declaration.members);
        break;
      }
      case "script_module": {
        if (Array.isArray(declaration.members.body) && typeof declaration.members.entry === "string") {
          outputs.push({
            path: `behavior_pack/${declaration.members.entry}`,
            kind: "text",
            content: `${declaration.members.body.join("\n")}\n`
          });
        }
        break;
      }
      default:
        break;
    }
  }

  if (Object.keys(itemTextures).length > 0) {
    outputs.push({
      path: "resource_pack/textures/item_texture.json",
      kind: "json",
      content: stableJson({
        resource_pack_name: config?.project?.slug ?? metadata.slug,
        texture_name: "atlas.items",
        texture_data: itemTextures
      })
    });
  }

  if (locales.size > 0) {
    const languageNames = [...locales.keys()].sort();
    outputs.push({
      path: "resource_pack/texts/languages.json",
      kind: "json",
      content: stableJson(languageNames)
    });

    for (const locale of languageNames) {
      outputs.push({
        path: `resource_pack/texts/${locale}.lang`,
        kind: "text",
        content: `${Object.keys(locales.get(locale))
          .sort()
          .map((key) => `${key}=${locales.get(locale)[key]}`)
          .join("\n")}\n`
      });
    }
  }

  return outputs.sort((left, right) => left.path.localeCompare(right.path));
}

function extractDeclarations(source) {
  const declarations = [];
  const pattern = /\b(addon|item|block|entity|recipe|loot_table|function|animation|animation_controller|spawn_rule|locale|script_module)\s+([A-Za-z_][A-Za-z0-9_-]*)\s*\{/g;

  let match;
  while ((match = pattern.exec(source))) {
    const braceIndex = source.indexOf("{", match.index);
    const block = readBalancedBlock(source, braceIndex);
    declarations.push({
      kind: match[1],
      name: match[2],
      line: lineForOffset(source, match.index),
      members: parseMembers(block.content)
    });
    pattern.lastIndex = block.end + 1;
  }

  return declarations;
}

function parseMembers(body) {
  const members = {};
  let index = 0;

  while (index < body.length) {
    index = skipWhitespace(body, index);
    if (index >= body.length) {
      break;
    }

    const keyResult = readKey(body, index);
    if (!keyResult) {
      break;
    }
    index = skipWhitespace(body, keyResult.end);
    if (body[index] !== ":") {
      break;
    }
    index = skipWhitespace(body, index + 1);

    const valueResult = readValueUntilSemicolon(body, index);
    members[keyResult.key] = parseValue(valueResult.text.trim());
    index = valueResult.end + 1;
  }

  return members;
}

function readKey(text, start) {
  if (text[start] === "\"") {
    let index = start + 1;
    while (index < text.length) {
      if (text[index] === "\"" && text[index - 1] !== "\\") {
        break;
      }
      index += 1;
    }
    return {
      key: JSON.parse(text.slice(start, index + 1)),
      end: index + 1
    };
  }

  let index = start;
  while (index < text.length && /[A-Za-z0-9_.-]/.test(text[index])) {
    index += 1;
  }

  return index > start
    ? {
        key: text.slice(start, index),
        end: index
      }
    : null;
}

function readValueUntilSemicolon(text, start) {
  let index = start;
  let braceDepth = 0;
  let bracketDepth = 0;
  let inString = false;

  while (index < text.length) {
    const character = text[index];

    if (character === "\"" && text[index - 1] !== "\\") {
      inString = !inString;
      index += 1;
      continue;
    }

    if (!inString) {
      if (character === "{") {
        braceDepth += 1;
      } else if (character === "}") {
        braceDepth -= 1;
      } else if (character === "[") {
        bracketDepth += 1;
      } else if (character === "]") {
        bracketDepth -= 1;
      } else if (character === ";" && braceDepth === 0 && bracketDepth === 0) {
        return {
          text: text.slice(start, index),
          end: index
        };
      }
    }

    index += 1;
  }

  return {
    text: text.slice(start),
    end: text.length
  };
}

function parseValue(rawValue) {
  if (rawValue.length === 0) {
    return "";
  }

  if (rawValue === "true" || rawValue === "false") {
    return rawValue === "true";
  }

  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    return Number(rawValue);
  }

  if (rawValue.startsWith("\"") || rawValue.startsWith("[") || rawValue.startsWith("{")) {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue;
    }
  }

  return rawValue;
}

function readBalancedBlock(text, braceStart) {
  let index = braceStart;
  let depth = 0;
  let inString = false;

  while (index < text.length) {
    const character = text[index];

    if (character === "\"" && text[index - 1] !== "\\") {
      inString = !inString;
      index += 1;
      continue;
    }

    if (!inString) {
      if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          return {
            content: text.slice(braceStart + 1, index),
            end: index
          };
        }
      }
    }

    index += 1;
  }

  return {
    content: text.slice(braceStart + 1),
    end: text.length - 1
  };
}

function withFormatVersion(value, target) {
  if (!isObject(value)) {
    return { format_version: target };
  }

  return value.format_version === undefined
    ? { format_version: target, ...value }
    : value;
}

function stableJson(value) {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

function sortDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }

  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortDeep(value[key])])
    );
  }

  return value;
}

function createSeededUuid(seed) {
  let hex = "";
  let input = seed;

  while (hex.length < 32) {
    let hash = 2166136261;
    for (const character of input) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    hex += hash.toString(16).padStart(8, "0");
    input = `${input}:${hex.length}`;
  }

  hex = hex.slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function lineForOffset(text, offset) {
  return text.slice(0, offset).split("\n").length;
}

function skipWhitespace(text, index) {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function asVersion(value) {
  if (Array.isArray(value) && value.length === 3) {
    return value.map((entry) => Number(entry) || 0);
  }
  return [1, 0, 0];
}

function versionFromTarget(target) {
  return `${target}`.split(".").slice(0, 3).map((entry) => Number(entry) || 0);
}

function inferOutputKind(path) {
  return path.endsWith(".json") ? "json" : "text";
}

function loadStoredValue(storageKey, fallback) {
  return localStorage.getItem(storageKey) ?? fallback;
}

function hasErrors(diagnostics) {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function formatLocation(diagnostic) {
  if (!diagnostic.file) {
    return "No source location.";
  }
  return `${diagnostic.file}:${diagnostic.line ?? 1}:${diagnostic.column ?? 1}`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value) {
  return `${value}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
