import { handleUploadRequest } from "./server";
import type { UpliftApp } from "./types";

export function createNextHandler(app: UpliftApp) {
  return {
    GET: async () => Response.json({ ok: true }),
    POST: (req: Request) => handleUploadRequest(app, req)
  };
}
