import { buildPackagedArchiveResult, inspectArchive } from "./archiveAnalyzer.js";
import { analyzeWorkspaceScripts } from "./scriptAnalyzerClient.js";
import {
  buildArchiveDownload,
  createUploadWorkspace,
  createWorkspaceSnapshot,
  getWorkspaceEntry,
  hasUnanalyzedChanges,
  listWorkspaceEntries,
  markWorkspaceAnalyzed,
  revertWorkspaceFile,
  updateWorkspaceFile
} from "./uploadWorkspace.js";

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
    "behavior": { "name": "Hello BP", "description": "Behavior pack" },
    "resource": { "name": "Hello RP", "description": "Resource pack" }
  },
  "scripts": { "enabled": false, "modules": [] }
}`;

const editorFiles = [
  { path: "src/main.bca", label: "main.bca", storageKey: STORAGE_KEYS.source },
  { path: "bedrockc.config.json", label: "bedrockc.config.json", storageKey: STORAGE_KEYS.config }
];

const elements = {
  bridgePill: document.querySelector("#bridge-pill"),
  runStatePill: document.querySelector("#run-state-pill"),
  summaryPanel: document.querySelector("#summary-panel"),
  editorNavSection: document.querySelector("#editor-nav-section"),
  uploadNavSection: document.querySelector("#upload-nav-section"),
  editorFileList: document.querySelector("#editor-file-list"),
  uploadSummaryList: document.querySelector("#upload-summary-list"),
  editorTabs: document.querySelector("#editor-tabs"),
  textarea: document.querySelector("#editor-textarea"),
  editorHighlightLayer: document.querySelector("#editor-highlight-layer"),
  metricDiagnostics: document.querySelector("#metric-diagnostics"),
  metricOutputs: document.querySelector("#metric-outputs"),
  metricDuration: document.querySelector("#metric-duration"),
  lastCommand: document.querySelector("#last-command"),
  bridgeMode: document.querySelector("#bridge-mode"),
  watchState: document.querySelector("#watch-state"),
  diagnosticList: document.querySelector("#diagnostic-list"),
  diagnosticStatusChip: document.querySelector("#diagnostic-status-chip"),
  diagnosticCountChip: document.querySelector("#diagnostic-count-chip"),
  outputFileList: document.querySelector("#output-file-list"),
  activeOutputName: document.querySelector("#active-output-name"),
  activeOutputKind: document.querySelector("#active-output-kind"),
  viewerNote: document.querySelector("#viewer-note"),
  outputContent: document.querySelector("#output-content"),
  outputEditorShell: document.querySelector("#output-editor-shell"),
  outputEditor: document.querySelector("#output-editor"),
  outputHighlightLayer: document.querySelector("#output-highlight-layer"),
  validateButton: document.querySelector("#validate-button"),
  buildButton: document.querySelector("#build-button"),
  watchButton: document.querySelector("#watch-button"),
  resetButton: document.querySelector("#reset-button"),
  copyOutputButton: document.querySelector("#copy-output-button"),
  modeEditorButton: document.querySelector("#mode-editor-button"),
  modeUploadButton: document.querySelector("#mode-upload-button"),
  jumpWorkbenchButton: document.querySelector("#jump-workbench-button"),
  jumpDiagnosticsButton: document.querySelector("#jump-diagnostics-button"),
  jumpExplorerButton: document.querySelector("#jump-explorer-button"),
  editorWorkbench: document.querySelector("#editor-workbench"),
  uploadWorkbench: document.querySelector("#upload-workbench"),
  archiveInput: document.querySelector("#archive-input"),
  chooseArchiveButton: document.querySelector("#choose-archive-button"),
  clearArchiveButton: document.querySelector("#clear-archive-button"),
  analyzeArchiveButton: document.querySelector("#analyze-archive-button"),
  uploadWatchButton: document.querySelector("#upload-watch-button"),
  archiveDropzone: document.querySelector("#archive-dropzone"),
  selectedArchiveLabel: document.querySelector("#selected-archive-label"),
  uploadDetailGrid: document.querySelector("#upload-detail-grid"),
  explorerFilesButton: document.querySelector("#explorer-files-button"),
  explorerOutputsButton: document.querySelector("#explorer-outputs-button"),
  explorerSearchInput: document.querySelector("#explorer-search-input"),
  explorerCountChip: document.querySelector("#explorer-count-chip"),
  previewFileButton: document.querySelector("#preview-file-button"),
  editFileButton: document.querySelector("#edit-file-button"),
  revertFileButton: document.querySelector("#revert-file-button"),
  downloadArchiveButton: document.querySelector("#download-archive-button")
};

const state = {
  workbenchMode: "editor",
  explorerMode: "outputs",
  explorerFilter: "",
  files: {
    "src/main.bca": loadStoredValue(STORAGE_KEYS.source, SAMPLE_SOURCE),
    "bedrockc.config.json": loadStoredValue(STORAGE_KEYS.config, SAMPLE_CONFIG)
  },
  activeEditorFile: "src/main.bca",
  archive: null,
  archiveSummary: null,
  uploadWorkspace: null,
  archiveFiles: [],
  outputs: [],
  activePreviewPath: null,
  uploadViewerMode: "preview",
  diagnostics: [],
  watchEnabled: false,
  uploadWatchEnabled: false,
  running: false,
  lastCommand: "Not run yet",
  bridgeLabel: isHttpMode() ? "Vercel API" : "Browser Preview",
  lastDurationMs: 0
};

let watchTimer = null;

initialize();

function initialize() {
  setBridgeLabel(state.bridgeLabel);
  attachEvents();
  renderEditorFileButtons();
  renderEditorTabs();
  renderEditor();
  renderMode();
  renderSummaryPanel();
  renderUploadSummary();
  renderUploadDetails();
  renderDiagnostics();
  renderExplorer();
  renderMetrics(0);
  renderRunState("Idle", "status-idle");
  void runEditorCommand("build");
}

function attachEvents() {
  elements.textarea.addEventListener("input", (event) => {
    state.files[state.activeEditorFile] = event.target.value;
    persistCurrentEditor();
    renderSummaryPanel();
    renderEditorHighlights();
    if (state.watchEnabled && state.workbenchMode === "editor") {
      scheduleWatchBuild();
    }
  });
  elements.textarea.addEventListener("scroll", syncEditorHighlightScroll);

  elements.validateButton.addEventListener("click", () => void runEditorCommand("validate"));
  elements.buildButton.addEventListener("click", () => void runEditorCommand("build"));
  elements.resetButton.addEventListener("click", resetSample);
  elements.watchButton.addEventListener("click", toggleWatch);
  elements.uploadWatchButton.addEventListener("click", toggleUploadWatch);
  elements.copyOutputButton.addEventListener("click", () => void copyActivePreview());
  elements.modeEditorButton.addEventListener("click", () => switchWorkbenchMode("editor"));
  elements.modeUploadButton.addEventListener("click", () => switchWorkbenchMode("upload"));
  elements.jumpWorkbenchButton.addEventListener("click", () => scrollToSection("workbench-section"));
  elements.jumpDiagnosticsButton.addEventListener("click", () => scrollToSection("diagnostics-section"));
  elements.jumpExplorerButton.addEventListener("click", () => scrollToSection("explorer-section"));
  elements.explorerFilesButton.addEventListener("click", () => switchExplorerMode("files"));
  elements.explorerOutputsButton.addEventListener("click", () => switchExplorerMode("outputs"));
  elements.explorerSearchInput.addEventListener("input", (event) => {
    state.explorerFilter = event.target.value.trim().toLowerCase();
    state.activePreviewPath = null;
    renderExplorer();
  });
  elements.outputEditor.addEventListener("input", (event) => {
    if (!state.uploadWorkspace || !state.activePreviewPath) {
      return;
    }
    updateWorkspaceFile(state.uploadWorkspace, state.activePreviewPath, event.target.value);
    syncArchiveFilesFromWorkspace();
    renderUploadSummary();
    renderUploadDetails();
    refreshExplorerListDirtyState();
    const activeEntry = getWorkspaceEntry(state.uploadWorkspace, state.activePreviewPath);
    elements.viewerNote.textContent = activeEntry ? describeActiveEntry(activeEntry) : elements.viewerNote.textContent;
    elements.revertFileButton.disabled = !Boolean(activeEntry?.dirty);
    elements.downloadArchiveButton.disabled = hasUnanalyzedChanges(state.uploadWorkspace);
    renderOutputHighlights();
    if (state.uploadWatchEnabled && state.workbenchMode === "upload") {
      scheduleUploadWatchAnalysis();
    }
  });
  elements.outputEditor.addEventListener("scroll", syncOutputHighlightScroll);
  elements.chooseArchiveButton.addEventListener("click", () => elements.archiveInput.click());
  elements.clearArchiveButton.addEventListener("click", clearArchiveSelection);
  elements.archiveInput.addEventListener("change", (event) => {
    void selectArchive(event.target.files?.[0] ?? null, { autoAnalyze: true });
  });
  elements.analyzeArchiveButton.addEventListener("click", () => void runArchiveAnalysis());
  elements.previewFileButton.addEventListener("click", () => switchUploadViewerMode("preview"));
  elements.editFileButton.addEventListener("click", () => switchUploadViewerMode("edit"));
  elements.revertFileButton.addEventListener("click", () => revertActiveWorkspaceFile());
  elements.downloadArchiveButton.addEventListener("click", () => void downloadEditedArchive());
  elements.archiveDropzone.addEventListener("click", () => elements.archiveInput.click());
  elements.archiveDropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.archiveInput.click();
    }
  });
  elements.archiveDropzone.addEventListener("dragover", onArchiveDragOver);
  elements.archiveDropzone.addEventListener("dragleave", onArchiveDragLeave);
  elements.archiveDropzone.addEventListener("drop", (event) => void onArchiveDrop(event));
}

async function runEditorCommand(command, fromWatch = false) {
  if (state.running) {
    return;
  }

  state.running = true;
  state.lastCommand = fromWatch ? "Watch rebuild" : capitalize(command);
  elements.lastCommand.textContent = state.lastCommand;
  renderRunState("Running", "status-running");

  try {
    const result = isHttpMode()
      ? await invokeApiCompile(command, state.files)
      : await runPreviewCompilation(command, state.files);
    applyEditorResult(result);
  } catch (error) {
    applyFailure(error);
  } finally {
    state.running = false;
  }
}

async function runArchiveAnalysis() {
  if (state.running) {
    return;
  }

  if (!state.archive) {
    state.diagnostics = [
      {
        severity: "warning",
        code: "ARC0001",
        message: "Choose an archive before running upload analysis.",
        file: "upload",
        line: 1,
        column: 1
      }
    ];
    renderDiagnostics();
    return;
  }

  state.running = true;
  state.lastCommand = "Analyze upload";
  elements.lastCommand.textContent = state.lastCommand;
  renderRunState("Running", "status-running");
  const startedAt = performance.now();

  try {
    if (!state.uploadWorkspace) {
      const inspection = await inspectArchive(state.archive);
      state.uploadWorkspace = createUploadWorkspace(state.archive, inspection);
    }

    const snapshot = createWorkspaceSnapshot(state.uploadWorkspace);
    let result;
    if (snapshot.modeInfo.mode === "packaged-addon") {
      result = buildPackagedArchiveResult(state.archive, {
        archiveType: snapshot.archiveType,
        files: snapshot.files,
        durationMs: 0
      });
      let scriptDiagnostics = [];
      try {
        scriptDiagnostics = await analyzeWorkspaceScripts(state.uploadWorkspace);
      } catch (error) {
        scriptDiagnostics = [
          createUiDiagnostic(
            "error",
            "SCR0001",
            error.message ?? "Script analysis could not be completed in the browser."
          )
        ];
      }
      result = {
        ...result,
        diagnostics: [...scriptDiagnostics, ...normalizeDiagnostics(result.diagnostics)],
        durationMs: performance.now() - startedAt
      };
    } else {
      result = await analyzeSourceArchive(snapshot);
      result.durationMs = performance.now() - startedAt;
    }

    markWorkspaceAnalyzed(state.uploadWorkspace);
    applyArchiveResult(result);
  } catch (error) {
    applyFailure(error);
  } finally {
    state.running = false;
  }
}

async function analyzeSourceArchive(inspection) {
  if (!isHttpMode() || (state.uploadWorkspace && state.uploadWorkspace.revision > 0)) {
    return runSourceArchivePreview(inspection, {
      routeLabel: "Browser source preview",
      warning: !isHttpMode()
        ? "Running source archive analysis in browser preview mode because no server bridge is available."
        : "Edited source uploads are reanalyzed in browser preview mode."
    });
  }

  try {
    return await invokeApiArchive(state.archive);
  } catch (error) {
    if (error.status === 413) {
      return runSourceArchivePreview(inspection, {
        routeLabel: "Browser source preview",
        warning:
          "The public upload bridge rejected this source archive before the compiler ran. A browser preview was generated instead."
      });
    }
    throw error;
  }
}

async function runSourceArchivePreview(inspection, options = {}) {
  const configPath = inspection.modeInfo.configPath;
  const archiveMap = new Map(inspection.files.map((file) => [file.path, file]));
  const configFile = archiveMap.get(configPath);
  const diagnostics = [];
  let configContent = configFile?.content ?? "{}";
  let sourceContent = "";

  if (!configFile) {
    diagnostics.push(createUiDiagnostic("error", "ARC4101", "Source archive is missing bedrockc.config.json."));
  } else {
    try {
      const configJson = JSON.parse(configContent);
      const entryPath = resolveArchivePath(dirname(configPath), configJson.entry ?? "./src/main.bca");
      const entryFile = archiveMap.get(entryPath);
      if (!entryFile) {
        diagnostics.push(
          createUiDiagnostic("error", "ARC4102", `Configured entry file '${entryPath}' was not found in the archive.`)
        );
      } else {
        sourceContent = entryFile.content ?? "";
      }

      const sourceFileCount = inspection.files.filter((file) => file.ext === ".bca").length;
      if (sourceFileCount > 1) {
        diagnostics.push(
          createUiDiagnostic(
            "warning",
            "ARC4103",
            "Browser preview uses the configured entry file only. Multi-file source archives still need the server compiler for full resolution."
          )
        );
      }
    } catch (error) {
      diagnostics.push(createUiDiagnostic("error", "ARC4104", `Config parse failed: ${error.message}`));
    }
  }

  let previewResult = {
    bridgeLabel: options.routeLabel ?? "Browser source preview",
    diagnostics: [],
    outputs: [],
    durationMs: 0
  };

  if (!hasErrors(diagnostics) && sourceContent) {
    previewResult = await runPreviewCompilation("build", {
      "bedrockc.config.json": configContent,
      "src/main.bca": sourceContent
    });
  }

  if (options.warning) {
    diagnostics.unshift(createUiDiagnostic("warning", "ARC4100", options.warning));
  }

  const allDiagnostics = [...diagnostics, ...normalizeDiagnostics(previewResult.diagnostics)];

  return {
    bridgeLabel: options.routeLabel ?? "Browser source preview",
    mode: "source-archive",
    archiveType: inspection.archiveType,
    summary: {
      filename: state.archive?.name ?? "archive.zip",
      size: state.archive?.size ?? 0,
      detectedType: "bedrockc source project",
      analysisRoute: options.routeLabel ?? "Browser source preview",
      configPath,
      packCount: 0,
      fileCount: inspection.files.length
    },
    diagnostics: allDiagnostics,
    files: inspection.files.map((file) => ({
      path: file.path,
      kind: file.ext === ".json" ? "json" : "text",
      previewable: file.previewable,
      content: file.previewable ? file.content ?? "" : null,
      size: file.size
    })),
    outputs: normalizeEntries(previewResult.outputs),
    durationMs: inspection.durationMs + (previewResult.durationMs ?? 0)
  };
}

function applyEditorResult(result) {
  const previousPreviewPath = state.activePreviewPath;
  state.bridgeLabel = result.bridgeLabel ?? state.bridgeLabel;
  setBridgeLabel(state.bridgeLabel);
  state.archiveSummary = null;
  state.uploadWorkspace = null;
  state.archiveFiles = [];
  state.outputs = normalizeEntries(result.outputs);
  state.diagnostics = normalizeDiagnostics(result.diagnostics);
  state.explorerMode = state.outputs.length > 0 ? "outputs" : "files";
  const nextEntries = currentExplorerEntries();
  state.activePreviewPath = nextEntries.some((entry) => entry.path === previousPreviewPath)
    ? previousPreviewPath
    : nextEntries[0]?.path ?? null;
  renderAll(result.durationMs ?? 0);
  renderRunState(
    hasErrors(state.diagnostics) ? "Needs fixes" : "Ready",
    hasErrors(state.diagnostics) ? "status-error" : "status-success"
  );
}

function applyArchiveResult(result) {
  const previousPreviewPath = state.activePreviewPath;
  state.bridgeLabel = result.bridgeLabel ?? state.bridgeLabel;
  setBridgeLabel(state.bridgeLabel);
  state.archiveSummary = result.summary ?? null;
  syncArchiveFilesFromWorkspace();
  state.outputs = normalizeEntries(result.outputs);
  state.diagnostics = normalizeDiagnostics(result.diagnostics);
  state.explorerMode = state.archiveFiles.length > 0 ? "files" : "outputs";
  const nextEntries = currentExplorerEntries();
  state.activePreviewPath = nextEntries.some((entry) => entry.path === previousPreviewPath)
    ? previousPreviewPath
    : nextEntries[0]?.path ?? null;
  renderAll(result.durationMs ?? 0);
  renderRunState(
    hasErrors(state.diagnostics) ? "Needs fixes" : "Analyzed",
    hasErrors(state.diagnostics) ? "status-error" : "status-success"
  );
}

function applyFailure(error) {
  const message = error?.message ?? "Unexpected workbench failure.";
  state.diagnostics = [
    {
      severity: "error",
      code: "UI9001",
      message,
      file: "workbench",
      line: 1,
      column: 1
    }
  ];
  state.outputs = [];
  state.activePreviewPath = null;
  renderAll(0);
  renderRunState("Failed", "status-error");
}

function renderAll(durationMs) {
  state.lastDurationMs = durationMs ?? 0;
  renderMode();
  renderWatchState();
  renderSummaryPanel();
  renderUploadSummary();
  renderUploadDetails();
  renderDiagnostics();
  renderExplorer();
  renderMetrics(state.lastDurationMs);
}

function renderMode() {
  const editorMode = state.workbenchMode === "editor";
  elements.modeEditorButton.classList.toggle("is-active", editorMode);
  elements.modeUploadButton.classList.toggle("is-active", !editorMode);
  elements.editorWorkbench.hidden = !editorMode;
  elements.uploadWorkbench.hidden = editorMode;
  elements.editorNavSection.hidden = !editorMode;
  elements.uploadNavSection.hidden = editorMode;
}

function renderSummaryPanel() {
  const entries = state.workbenchMode === "editor"
    ? [
        ["Mode", "Editor"],
        ["Entrypoint", "src/main.bca"],
        ["Config", "bedrockc.config.json"],
        ["Target", currentTargetVersion()]
      ]
    : [
        ["Mode", "Upload"],
        ["Archive", state.archive?.name ?? "None selected"],
        ["Detected", state.archiveSummary?.detectedType ?? "Awaiting upload"],
        ["Route", state.archiveSummary?.analysisRoute ?? "Not analyzed"]
      ];

  elements.summaryPanel.innerHTML = entries
    .map(
      ([label, value]) => `
        <div>
          <span class="summary-label">${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `
    )
    .join("");
}

function renderUploadSummary() {
  const dirtyCount = state.uploadWorkspace?.entries.filter((entry) => entry.dirty).length ?? 0;
  const items = state.archiveSummary
    ? [
        ["Detected", state.archiveSummary.detectedType ?? "Unknown"],
        ["Route", state.archiveSummary.analysisRoute ?? "Unknown"],
        ["Edited", String(dirtyCount)],
        ["Duration", `${Math.round(state.lastDurationMs)}ms`]
      ]
    : [
        ["Detected", "No upload analyzed"],
        ["Route", "Awaiting selection"],
        ["Edited", "0"],
        ["Duration", "0ms"]
      ];

  elements.uploadSummaryList.innerHTML = items
    .map(
      ([label, value]) => `
        <div class="summary-card">
          <span class="summary-label">${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `
    )
    .join("");
}

function renderUploadDetails() {
  const dirtyCount = state.uploadWorkspace?.entries.filter((entry) => entry.dirty).length ?? 0;
  const details = [
    ["File", state.archive?.name ?? "No archive selected"],
    ["Archive type", state.archive ? inferArchiveType(state.archive.name) : "Unknown"],
    ["Detected project", state.archiveSummary?.detectedType ?? "Awaiting analysis"],
    ["Analysis route", state.archiveSummary?.analysisRoute ?? "Not analyzed"],
    ["Pack count", String(state.archiveSummary?.packCount ?? 0)],
    ["File count", String(state.archiveSummary?.fileCount ?? 0)],
    ["Edited files", String(dirtyCount)],
    ["Duration", `${Math.round(state.lastDurationMs)}ms`],
    ["Size", formatBytes(state.archiveSummary?.size ?? state.archive?.size ?? 0)]
  ];

  elements.selectedArchiveLabel.textContent = state.archive?.name ?? "No file selected";
  elements.uploadDetailGrid.innerHTML = details
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <span class="summary-label">${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");
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
  renderEditorHighlights();
}

function renderDiagnostics() {
  elements.diagnosticList.innerHTML = "";
  const diagnostics = state.diagnostics.length > 0
    ? state.diagnostics
    : [
        {
          severity: "success",
          code: "UI0000",
          message: state.workbenchMode === "editor"
            ? "No diagnostics. The current project shape is ready for emission."
            : "No diagnostics yet. Upload an archive to inspect it.",
          file: "workbench",
          line: 1,
          column: 1
        }
      ];

  for (const diagnostic of diagnostics) {
    const item = document.createElement("article");
    const targetEntry = diagnostic.file ? getWorkspaceEntry(state.uploadWorkspace, diagnostic.file) : null;
    const isEditorTarget = state.workbenchMode === "editor" && editorFiles.some((file) => file.path === diagnostic.file);
    item.className = `diagnostic-item is-${diagnostic.severity}${targetEntry || isEditorTarget ? " is-clickable" : ""}`;
    item.innerHTML = `
      <strong>${diagnostic.severity.toUpperCase()} ${escapeHtml(diagnostic.code)}</strong>
      <p>${escapeHtml(diagnostic.message)}</p>
      <p>${escapeHtml(formatLocation(diagnostic))}</p>
    `;
    if (targetEntry) {
      item.addEventListener("click", () => openWorkspaceDiagnostic(targetEntry.path));
    } else if (isEditorTarget) {
      item.addEventListener("click", () => openEditorDiagnostic(diagnostic.file));
    }
    elements.diagnosticList.append(item);
  }

  renderDiagnosticSummary(diagnostics);
  renderEditorHighlights();
  renderOutputHighlights();
}

function renderDiagnosticSummary(diagnostics) {
  const visibleDiagnostics = diagnostics.filter((diagnostic) => diagnostic.severity !== "success");
  const errorCount = visibleDiagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = visibleDiagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;

  elements.diagnosticCountChip.textContent = `${visibleDiagnostics.length} message${visibleDiagnostics.length === 1 ? "" : "s"}`;
  elements.diagnosticStatusChip.className = `chip ${
    errorCount > 0 ? "status-error" : warningCount > 0 ? "status-running" : "status-success"
  }`;
  elements.diagnosticStatusChip.textContent = errorCount > 0
    ? `${errorCount} error${errorCount === 1 ? "" : "s"}`
    : warningCount > 0
      ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
      : "No issues";
}

function renderExplorer() {
  const uploadMode = state.workbenchMode === "upload";
  const hasFiles = state.archiveFiles.length > 0;
  const hasOutputs = state.outputs.length > 0;

  if (state.explorerMode === "files" && !hasFiles && hasOutputs) {
    state.explorerMode = "outputs";
  }
  if (state.explorerMode === "outputs" && !hasOutputs && hasFiles) {
    state.explorerMode = "files";
  }

  elements.explorerFilesButton.classList.toggle("is-active", state.explorerMode === "files");
  elements.explorerOutputsButton.classList.toggle("is-active", state.explorerMode === "outputs");
  elements.explorerFilesButton.disabled = !hasFiles;
  elements.explorerOutputsButton.disabled = !hasOutputs;

  const allEntries = currentExplorerEntries();
  const entries = filterExplorerEntries(allEntries, state.explorerFilter);
  elements.outputFileList.innerHTML = "";
  elements.explorerCountChip.textContent = allEntries.length === entries.length
    ? `${entries.length} shown`
    : `${entries.length} of ${allEntries.length} shown`;

  if (entries.length === 0) {
    elements.activeOutputName.textContent = state.explorerFilter
      ? "No entries match the current filter"
      : state.explorerMode === "files"
        ? "No archive file selected"
        : "No output selected";
    elements.activeOutputKind.textContent = "Text";
    elements.viewerNote.textContent = "Preview unpacked files or generated output.";
    elements.outputContent.textContent = state.explorerFilter
      ? "Change or clear the filter to see more files."
      : state.explorerMode === "files"
        ? "Upload and analyze an archive to preview unpacked files."
        : "Run a successful build to preview generated Bedrock files.";
    elements.outputEditor.hidden = true;
    elements.outputEditorShell.hidden = true;
    elements.outputContent.hidden = false;
    renderOutputHighlights();
    elements.previewFileButton.disabled = true;
    elements.editFileButton.disabled = true;
    elements.revertFileButton.disabled = true;
    elements.downloadArchiveButton.disabled = !uploadMode || !state.uploadWorkspace || hasUnanalyzedChanges(state.uploadWorkspace);
    elements.copyOutputButton.disabled = true;
    return;
  }

  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.path = entry.path;
    button.className = `output-button${entry.path === state.activePreviewPath ? " is-active" : ""}${entry.dirty ? " is-dirty" : ""}`;
    button.textContent = entry.dirty ? `${entry.path} *` : entry.path;
    button.addEventListener("click", () => {
      state.activePreviewPath = entry.path;
      if (!entry.editable) {
        state.uploadViewerMode = "preview";
      }
      renderExplorer();
    });
    elements.outputFileList.append(button);
  }

  const activeEntry = entries.find((entry) => entry.path === state.activePreviewPath) ?? entries[0];
  state.activePreviewPath = activeEntry.path;
  elements.activeOutputName.textContent = activeEntry.path;
  elements.activeOutputKind.textContent = activeEntry.previewable === false ? "Binary" : activeEntry.kind.toUpperCase();
  elements.viewerNote.textContent = describeActiveEntry(activeEntry);
  const canEdit = uploadMode && state.explorerMode === "files" && activeEntry.editable;
  if (!canEdit) {
    state.uploadViewerMode = "preview";
  }
  elements.previewFileButton.classList.toggle("is-active", state.uploadViewerMode === "preview");
  elements.editFileButton.classList.toggle("is-active", state.uploadViewerMode === "edit");
  elements.previewFileButton.disabled = !uploadMode || !activeEntry.previewable;
  elements.editFileButton.disabled = !canEdit;
  elements.revertFileButton.disabled = !uploadMode || !Boolean(activeEntry.dirty);
  elements.downloadArchiveButton.disabled = !uploadMode || !state.uploadWorkspace || hasUnanalyzedChanges(state.uploadWorkspace);

  if (state.uploadViewerMode === "edit" && canEdit) {
    elements.outputEditorShell.hidden = false;
    elements.outputContent.hidden = true;
    elements.outputEditor.value = activeEntry.content;
    renderOutputHighlights();
  } else {
    elements.outputEditorShell.hidden = true;
    elements.outputContent.hidden = false;
    elements.outputContent.textContent = activeEntry.previewable === false
      ? "Binary file preview is not available."
      : activeEntry.content;
    renderOutputHighlights();
  }
  elements.copyOutputButton.disabled = activeEntry.previewable === false;
}

function renderMetrics(durationMs) {
  elements.metricDiagnostics.textContent = String(
    state.diagnostics.filter((item) => item.severity !== "success").length
  );
  elements.metricOutputs.textContent = String(
    state.workbenchMode === "upload" ? state.archiveFiles.length : state.outputs.length
  );
  elements.metricDuration.textContent = `${Math.round(durationMs || 0)}ms`;
}

function renderRunState(label, className) {
  elements.runStatePill.textContent = label;
  elements.runStatePill.className = `status-pill ${className}`;
}

function switchWorkbenchMode(mode) {
  state.workbenchMode = mode;
  if (mode === "upload") {
    state.watchEnabled = false;
    elements.watchButton.classList.remove("is-toggled");
    elements.watchButton.textContent = "Watch Off";
    if (state.archiveFiles.length > 0) {
      state.explorerMode = "files";
    }
  } else if (state.outputs.length > 0) {
    state.explorerMode = "outputs";
  }
  renderWatchState();
  renderAll(state.lastDurationMs);
}

function switchExplorerMode(mode) {
  const entries = mode === "files" ? state.archiveFiles : state.outputs;
  if (entries.length === 0) {
    return;
  }
  state.explorerMode = mode;
  state.activePreviewPath = filterExplorerEntries(entries, state.explorerFilter)[0]?.path
    ?? entries[0]?.path
    ?? null;
  renderExplorer();
}

function switchUploadViewerMode(mode) {
  if (mode === "edit") {
    const activeEntry = currentExplorerEntries().find((entry) => entry.path === state.activePreviewPath);
    if (!activeEntry?.editable) {
      return;
    }
  }
  state.uploadViewerMode = mode;
  renderExplorer();
}

function openWorkspaceDiagnostic(targetPath) {
  state.explorerMode = "files";
  state.activePreviewPath = targetPath;
  state.explorerFilter = "";
  elements.explorerSearchInput.value = "";
  const entry = getWorkspaceEntry(state.uploadWorkspace, targetPath);
  state.uploadViewerMode = entry?.editable ? "edit" : "preview";
  renderExplorer();
  scrollToSection("explorer-section");
}

function openEditorDiagnostic(targetPath) {
  if (!editorFiles.some((file) => file.path === targetPath)) {
    return;
  }
  state.workbenchMode = "editor";
  state.activeEditorFile = targetPath;
  renderEditorFileButtons();
  renderEditorTabs();
  renderEditor();
  renderAll(state.lastDurationMs);
  scrollToSection("workbench-section");
}

function revertActiveWorkspaceFile() {
  if (!state.uploadWorkspace || !state.activePreviewPath) {
    return;
  }
  revertWorkspaceFile(state.uploadWorkspace, state.activePreviewPath);
  syncArchiveFilesFromWorkspace();
  renderUploadSummary();
  renderUploadDetails();
  renderExplorer();
  if (state.uploadWatchEnabled && state.workbenchMode === "upload") {
    scheduleUploadWatchAnalysis();
  }
}

async function downloadEditedArchive() {
  if (!state.uploadWorkspace) {
    return;
  }
  if (hasUnanalyzedChanges(state.uploadWorkspace)) {
    state.diagnostics = [
      createUiDiagnostic(
        "warning",
        "ARC5001",
        "Reanalyze the edited upload before downloading the updated archive."
      ),
      ...state.diagnostics
    ];
    renderDiagnostics();
    return;
  }

  const artifact = await buildArchiveDownload(state.uploadWorkspace);
  const url = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toggleWatch() {
  state.watchEnabled = !state.watchEnabled;
  elements.watchButton.classList.toggle("is-toggled", state.watchEnabled);
  elements.watchButton.textContent = state.watchEnabled ? "Watch On" : "Watch Off";
  renderWatchState();

  if (state.watchEnabled) {
    scheduleWatchBuild();
  } else if (watchTimer) {
    clearTimeout(watchTimer);
  }
}

function toggleUploadWatch() {
  state.uploadWatchEnabled = !state.uploadWatchEnabled;
  elements.uploadWatchButton.classList.toggle("is-toggled", state.uploadWatchEnabled);
  elements.uploadWatchButton.textContent = state.uploadWatchEnabled ? "Watch Upload On" : "Watch Upload Off";
  renderWatchState();

  if (state.uploadWatchEnabled) {
    scheduleUploadWatchAnalysis();
  } else if (watchTimer && state.workbenchMode === "upload") {
    clearTimeout(watchTimer);
  }
}

function scheduleWatchBuild() {
  if (watchTimer) {
    clearTimeout(watchTimer);
  }
  watchTimer = setTimeout(() => {
    if (state.workbenchMode === "editor") {
      void runEditorCommand("build", true);
    }
  }, 600);
}

function scheduleUploadWatchAnalysis() {
  if (watchTimer) {
    clearTimeout(watchTimer);
  }
  watchTimer = setTimeout(() => {
    if (
      state.workbenchMode === "upload"
      && state.uploadWatchEnabled
      && !state.running
      && state.uploadWorkspace
      && hasUnanalyzedChanges(state.uploadWorkspace)
    ) {
      void runArchiveAnalysis();
    }
  }, 600);
}

async function selectArchive(file, options = {}) {
  state.archive = file;
  state.archiveSummary = null;
  state.uploadWorkspace = null;
  state.archiveFiles = [];
  state.outputs = [];
  state.diagnostics = [];
  state.activePreviewPath = null;
  state.uploadViewerMode = "preview";
  state.explorerFilter = "";
  elements.explorerSearchInput.value = "";
  renderUploadSummary();
  renderUploadDetails();
  renderExplorer();

  if (file && options.autoAnalyze) {
    await runArchiveAnalysis();
  }
}

function clearArchiveSelection() {
  state.archive = null;
  state.archiveSummary = null;
  state.uploadWorkspace = null;
  state.archiveFiles = [];
  state.outputs = [];
  state.diagnostics = [];
  state.activePreviewPath = null;
  state.uploadViewerMode = "preview";
  state.explorerFilter = "";
  state.lastDurationMs = 0;
  elements.archiveInput.value = "";
  elements.explorerSearchInput.value = "";
  renderWatchState();
  renderAll(0);
  renderRunState("Idle", "status-idle");
}

function renderWatchState() {
  if (state.workbenchMode === "upload" && state.uploadWatchEnabled) {
    elements.watchState.textContent = "Enabled (Upload)";
    return;
  }

  if (state.workbenchMode === "editor" && state.watchEnabled) {
    elements.watchState.textContent = "Enabled (Editor)";
    return;
  }

  elements.watchState.textContent = "Disabled";
}

function renderEditorHighlights() {
  renderDiagnosticHighlights(
    elements.editorHighlightLayer,
    elements.textarea,
    collectLineDiagnostics(state.activeEditorFile)
  );
}

function renderOutputHighlights() {
  const diagnostics = state.workbenchMode === "upload" && state.explorerMode === "files" && state.activePreviewPath
    ? collectLineDiagnostics(state.activePreviewPath)
    : [];
  renderDiagnosticHighlights(elements.outputHighlightLayer, elements.outputEditor, diagnostics);
}

function collectLineDiagnostics(filePath) {
  if (!filePath) {
    return [];
  }

  const highestSeverityByLine = new Map();
  for (const diagnostic of state.diagnostics) {
    if (
      diagnostic.file !== filePath
      || diagnostic.severity === "success"
      || !Number.isFinite(diagnostic.line)
      || diagnostic.line < 1
    ) {
      continue;
    }
    const current = highestSeverityByLine.get(diagnostic.line);
    if (!current || compareDiagnosticSeverity(diagnostic.severity, current.severity) > 0) {
      highestSeverityByLine.set(diagnostic.line, diagnostic);
    }
  }

  return [...highestSeverityByLine.values()].sort((left, right) => left.line - right.line);
}

function compareDiagnosticSeverity(left, right) {
  return diagnosticSeverityWeight(left) - diagnosticSeverityWeight(right);
}

function diagnosticSeverityWeight(severity) {
  switch (severity) {
    case "error":
      return 3;
    case "warning":
      return 2;
    case "success":
      return 1;
    default:
      return 0;
  }
}

function renderDiagnosticHighlights(layer, textarea, diagnostics) {
  if (!layer || !textarea) {
    return;
  }

  layer.innerHTML = "";
  if (!diagnostics.length) {
    layer.style.transform = "translateY(0)";
    return;
  }

  const style = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.7 || 24;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;

  for (const diagnostic of diagnostics) {
    const line = document.createElement("div");
    line.className = `code-highlight-line ${diagnostic.severity === "warning" ? "is-warning" : "is-error"}`;
    line.title = `${diagnostic.code}: ${diagnostic.message}`;
    line.style.top = `${paddingTop + ((diagnostic.line - 1) * lineHeight)}px`;
    line.style.height = `${lineHeight}px`;
    line.style.left = `${paddingLeft}px`;
    line.style.right = `${paddingRight}px`;
    layer.append(line);
  }

  syncHighlightLayerScroll(layer, textarea);
}

function syncEditorHighlightScroll() {
  syncHighlightLayerScroll(elements.editorHighlightLayer, elements.textarea);
}

function syncOutputHighlightScroll() {
  syncHighlightLayerScroll(elements.outputHighlightLayer, elements.outputEditor);
}

function syncHighlightLayerScroll(layer, textarea) {
  if (!layer || !textarea) {
    return;
  }
  layer.style.transform = `translateY(${-textarea.scrollTop}px)`;
}

function resetSample() {
  state.files["src/main.bca"] = SAMPLE_SOURCE;
  state.files["bedrockc.config.json"] = SAMPLE_CONFIG;
  localStorage.removeItem(STORAGE_KEYS.source);
  localStorage.removeItem(STORAGE_KEYS.config);
  renderEditor();
  renderSummaryPanel();
  void runEditorCommand("build");
}

async function copyActivePreview() {
  const activeEntry = currentExplorerEntries().find((entry) => entry.path === state.activePreviewPath);
  if (!activeEntry || activeEntry.previewable === false) {
    return;
  }

  try {
    await navigator.clipboard.writeText(activeEntry.content);
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

async function invokeApiCompile(command, files) {
  const response = await fetch("/api/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, files })
  });
  const result = await response.json().catch(() => null);
  if (!response.ok && result) {
    return result;
  }
  if (!response.ok) {
    throw createHttpError(response.status, `Request failed with status ${response.status}.`);
  }
  return result;
}

async function invokeApiArchive(file) {
  const formData = new FormData();
  formData.append("archive", file);
  const response = await fetch("/api/archive", { method: "POST", body: formData });
  const result = await response.json().catch(() => null);
  if (!response.ok && result) {
    return result;
  }
  if (!response.ok) {
    throw createHttpError(
      response.status,
      response.status === 413
        ? "The public upload bridge rejected this archive because the request is too large."
        : `Archive request failed with status ${response.status}.`
    );
  }
  return result;
}

async function runPreviewCompilation(command, files) {
  const startedAt = performance.now();
  await delay(command === "build" ? 260 : 180);

  let config;
  const diagnostics = [];

  try {
    config = JSON.parse(files["bedrockc.config.json"]);
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

  const declarations = extractDeclarations(files["src/main.bca"] ?? "");
  const addon = declarations.find((declaration) => declaration.kind === "addon");
  if (!addon) {
    diagnostics.push({
      severity: "error",
      code: "BCA2003",
      message: "Exactly one 'addon' declaration is required.",
      file: "src/main.bca",
      line: 1,
      column: 1
    });
  }

  const metadata = deriveMetadata(config, addon);
  if (!metadata.namespace || !/^[a-z0-9_][a-z0-9_.-]*$/.test(metadata.namespace)) {
    diagnostics.push({
      severity: "error",
      code: "BCA3001",
      message: "Addon namespace must contain lowercase letters, digits, underscores, dots, or hyphens.",
      file: "src/main.bca",
      line: addon?.line ?? 1,
      column: 1
    });
  }

  return {
    bridgeLabel: "Browser Preview",
    diagnostics,
    outputs: hasErrors(diagnostics) ? [] : buildPreviewOutputs(metadata, declarations, config),
    durationMs: performance.now() - startedAt
  };
}

function deriveMetadata(config, addon) {
  const addonFields = addon?.members ?? {};
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

function buildPreviewOutputs(metadata, declarations, config) {
  const outputs = [
    {
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
        modules: [{ type: "data", uuid: metadata.behaviorPack.moduleUuid, version: metadata.version }]
      })
    },
    {
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
        modules: [{ type: "resources", uuid: metadata.resourcePack.moduleUuid, version: metadata.version }],
        dependencies: [{ uuid: metadata.behaviorPack.headerUuid, version: metadata.version }]
      })
    }
  ];

  const textures = {};
  const locales = new Map();

  for (const declaration of declarations) {
    if (declaration.kind === "item") {
      outputs.push({
        path: `behavior_pack/items/${declaration.members.path ?? declaration.name}.json`,
        kind: "json",
        content: stableJson({
          format_version: metadata.target,
          "minecraft:item": {
            description: { identifier: declaration.members.id ?? `${metadata.namespace}:${declaration.name}` },
            components: declaration.members.components ?? {}
          }
        })
      });
      if (declaration.members.icon || declaration.members.texture) {
        textures[declaration.members.icon ?? declaration.name] = {
          textures: declaration.members.texture ?? `textures/items/${declaration.name}`
        };
      }
    }
    if (declaration.kind === "function") {
      outputs.push({
        path: `behavior_pack/functions/${declaration.members.path ?? declaration.name}.mcfunction`,
        kind: "text",
        content: `${(declaration.members.body ?? []).join("\n")}\n`
      });
    }
    if (declaration.kind === "locale") {
      locales.set(declaration.name, declaration.members);
    }
  }

  if (Object.keys(textures).length > 0) {
    outputs.push({
      path: "resource_pack/textures/item_texture.json",
      kind: "json",
      content: stableJson({
        resource_pack_name: config?.project?.slug ?? metadata.slug,
        texture_name: "atlas.items",
        texture_data: textures
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
        content: `${Object.keys(locales.get(locale)).sort().map((key) => `${key}=${locales.get(locale)[key]}`).join("\n")}\n`
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
    return { key: JSON.parse(text.slice(start, index + 1)), end: index + 1 };
  }

  let index = start;
  while (index < text.length && /[A-Za-z0-9_.-]/.test(text[index])) {
    index += 1;
  }
  return index > start ? { key: text.slice(start, index), end: index } : null;
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
        return { text: text.slice(start, index), end: index };
      }
    }
    index += 1;
  }
  return { text: text.slice(start), end: text.length };
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
          return { content: text.slice(braceStart + 1, index), end: index };
        }
      }
    }
    index += 1;
  }
  return { content: text.slice(braceStart + 1), end: text.length - 1 };
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map((entry) => ({
    path: entry.path,
    kind: entry.kind ?? inferOutputKind(entry.path),
    content: entry.content ?? "",
    previewable: entry.previewable ?? true,
    size: entry.size ?? null,
    editable: entry.editable ?? false,
    dirty: entry.dirty ?? false
  }));
}

function normalizeDiagnostics(diagnostics) {
  return Array.isArray(diagnostics) ? diagnostics : [];
}

function currentExplorerEntries() {
  return state.explorerMode === "files" ? state.archiveFiles : state.outputs;
}

function currentTargetVersion() {
  try {
    return JSON.parse(state.files["bedrockc.config.json"]).project?.target ?? "Unknown";
  } catch {
    return "Invalid config";
  }
}

function inferArchiveType(fileName) {
  return fileName?.split(".").pop()?.toLowerCase() ?? "unknown";
}

function isHttpMode() {
  return window.location.protocol !== "file:";
}

function formatBytes(bytes) {
  if (!bytes) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function filterExplorerEntries(entries, query) {
  if (!query) {
    return entries;
  }
  return entries.filter((entry) => entry.path.toLowerCase().includes(query));
}

function syncArchiveFilesFromWorkspace() {
  state.archiveFiles = normalizeEntries(listWorkspaceEntries(state.uploadWorkspace));
}

function describeActiveEntry(entry) {
  if (entry.previewable === false) {
    return "Binary files can be inspected by path but not edited in the browser.";
  }
  if (entry.editable) {
    return entry.dirty
      ? "This file has unsaved analysis changes. Reanalyze before downloading the archive."
      : "This text file can be edited directly in the browser.";
  }
  return "Preview-only file. Editing is limited to supported text files in upload mode.";
}

function refreshExplorerListDirtyState() {
  for (const button of elements.outputFileList.querySelectorAll(".output-button")) {
    const entry = state.archiveFiles.find((item) => item.path === button.dataset.path);
    if (!entry) {
      continue;
    }
    button.classList.toggle("is-dirty", Boolean(entry.dirty));
    button.textContent = entry.dirty ? `${entry.path} *` : entry.path;
  }
}

function onArchiveDragOver(event) {
  event.preventDefault();
  elements.archiveDropzone.classList.add("is-dragover");
}

function onArchiveDragLeave() {
  elements.archiveDropzone.classList.remove("is-dragover");
}

async function onArchiveDrop(event) {
  event.preventDefault();
  elements.archiveDropzone.classList.remove("is-dragover");
  await selectArchive(event.dataTransfer?.files?.[0] ?? null, { autoAnalyze: true });
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

function stableJson(value) {
  return `${JSON.stringify(sortDeep(value), null, 2)}\n`;
}

function sortDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]));
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

function asVersion(value) {
  if (Array.isArray(value) && value.length === 3) {
    return value.map((entry) => Number(entry) || 0);
  }
  return [1, 0, 0];
}

function versionFromTarget(target) {
  return `${target}`.split(".").slice(0, 3).map((entry) => Number(entry) || 0);
}

function inferOutputKind(pathName) {
  return pathName.endsWith(".json") ? "json" : "text";
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

function setBridgeLabel(label) {
  elements.bridgePill.textContent = `Bridge: ${label}`;
  elements.bridgeMode.textContent = label;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return `${value}`.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createUiDiagnostic(severity, code, message) {
  return {
    severity,
    code,
    message,
    file: "upload",
    line: 1,
    column: 1
  };
}

function dirname(filePath) {
  const normalized = `${filePath}`.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : ".";
}

function resolveArchivePath(baseDir, relativePath) {
  const normalizedBase = `${baseDir}`.replace(/\\/g, "/");
  const normalizedRelative = `${relativePath}`.replace(/\\/g, "/");
  const segments = normalizedRelative.startsWith("/")
    ? []
    : normalizedBase === "." || normalizedBase.length === 0
      ? []
      : normalizedBase.split("/");
  for (const segment of normalizedRelative.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}
