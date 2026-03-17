const EDITABLE_EXTENSIONS = new Set([
  ".bca",
  ".cjs",
  ".js",
  ".json",
  ".lang",
  ".mcfunction",
  ".md",
  ".mjs",
  ".txt"
]);

export function createUploadWorkspace(uploadFile, inspection) {
  return {
    filename: uploadFile.name,
    archiveType: inspection.archiveType,
    modeInfo: inspection.modeInfo,
    originalSize: uploadFile.size,
    revision: 0,
    analyzedRevision: -1,
    entries: inspection.files.map((file) => createWorkspaceEntry(file))
  };
}

export function listWorkspaceEntries(workspace) {
  if (!workspace) {
    return [];
  }

  return workspace.entries.map((entry) => ({
    path: entry.path,
    kind: entry.kind,
    previewable: entry.previewable,
    content: entry.currentContent ?? "",
    size: entry.size,
    editable: entry.editable,
    dirty: entry.dirty
  }));
}

export function getWorkspaceEntry(workspace, targetPath) {
  return workspace?.entries.find((entry) => entry.path === targetPath) ?? null;
}

export function updateWorkspaceFile(workspace, targetPath, nextContent) {
  const entry = getWorkspaceEntry(workspace, targetPath);
  if (!entry || !entry.editable) {
    return false;
  }

  entry.currentContent = `${nextContent}`;
  entry.size = new TextEncoder().encode(entry.currentContent).length;
  entry.dirty = entry.currentContent !== (entry.originalContent ?? "");
  workspace.revision += 1;
  return true;
}

export function revertWorkspaceFile(workspace, targetPath) {
  const entry = getWorkspaceEntry(workspace, targetPath);
  if (!entry || !entry.editable) {
    return false;
  }

  entry.currentContent = entry.originalContent ?? "";
  entry.size = entry.originalBytes.byteLength;
  if (entry.dirty) {
    workspace.revision += 1;
  }
  entry.dirty = false;
  return true;
}

export function markWorkspaceAnalyzed(workspace) {
  if (!workspace) {
    return;
  }
  workspace.analyzedRevision = workspace.revision;
}

export function hasUnanalyzedChanges(workspace) {
  return Boolean(workspace) && workspace.revision !== workspace.analyzedRevision;
}

export function createWorkspaceSnapshot(workspace) {
  return {
    archiveType: workspace.archiveType,
    modeInfo: workspace.modeInfo,
    files: workspace.entries.map((entry) => ({
      path: entry.path,
      size: entry.size,
      ext: entry.ext,
      kind: entry.kind,
      previewable: entry.previewable,
      editable: entry.editable,
      dirty: entry.dirty,
      content: entry.previewable ? entry.currentContent ?? "" : null,
      buffer: entry.previewable
        ? new TextEncoder().encode(entry.currentContent ?? "")
        : entry.originalBytes
    }))
  };
}

export async function buildArchiveDownload(workspace) {
  const JSZip = getJsZip();
  const zip = new JSZip();
  for (const entry of workspace.entries) {
    zip.file(
      entry.path,
      entry.previewable ? entry.currentContent ?? "" : entry.originalBytes
    );
  }

  return {
    filename: workspace.filename,
    blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
  };
}

function createWorkspaceEntry(file) {
  return {
    path: file.path,
    ext: file.ext,
    kind: file.ext === ".json" ? "json" : "text",
    previewable: file.previewable,
    editable: file.previewable && EDITABLE_EXTENSIONS.has(file.ext),
    originalContent: file.previewable ? file.content ?? "" : null,
    currentContent: file.previewable ? file.content ?? "" : null,
    originalBytes: file.buffer,
    size: file.size,
    dirty: false
  };
}

function getJsZip() {
  const jszip = globalThis.JSZip;
  if (!jszip) {
    throw new Error("Archive export runtime is unavailable. Reload the page and try again.");
  }
  return jszip;
}
