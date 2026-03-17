let nextRequestId = 1;
let workerPromise = null;

export async function analyzeWorkspaceScripts(workspace) {
  const worker = await getWorker();
  const requestId = nextRequestId++;
  const payload = {
    type: "analyze",
    id: requestId,
    workspace: {
      archiveType: workspace.archiveType,
      modeInfo: workspace.modeInfo,
      files: workspace.entries
        .filter((entry) => entry.previewable)
        .map((entry) => ({
          path: entry.path,
          ext: entry.ext,
          content: entry.currentContent ?? ""
        }))
    }
  };

  return new Promise((resolve, reject) => {
    const handleMessage = (event) => {
      if (event.data?.id !== requestId) {
        return;
      }
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      if (event.data.type === "error") {
        reject(new Error(event.data.message));
        return;
      }
      resolve(Array.isArray(event.data.diagnostics) ? event.data.diagnostics : []);
    };

    const handleError = (error) => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleError);
      reject(error instanceof Error ? error : new Error("Script analysis worker failed."));
    };

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleError);
    worker.postMessage(payload);
  });
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = Promise.resolve(new Worker("./scriptAnalysisWorker.js"));
  }
  return workerPromise;
}
