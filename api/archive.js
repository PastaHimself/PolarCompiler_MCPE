import { archiveApiConfig, handleArchiveRequest } from "../src/archive/archiveService.js";

export const config = archiveApiConfig;

export default async function handler(req, res) {
  if (req.method === "GET") {
    res.status(200).json({
      ok: true,
      bridgeLabel: "Vercel Archive API"
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      message: "Method not allowed."
    });
    return;
  }

  try {
    const result = await handleArchiveRequest(req);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(400).json({
      ok: false,
      bridgeLabel: "Vercel Archive API",
      mode: "packaged-addon",
      archiveType: null,
      summary: null,
      diagnostics: [
        {
          severity: "error",
          code: "ARC1000",
          message: error.message,
          file: "api/archive",
          line: 1,
          column: 1
        }
      ],
      files: [],
      outputs: [],
      durationMs: 0
    });
  }
}
