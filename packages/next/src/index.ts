import { handleUploadRequest } from "@uplift-io/uplift/server";
import type { UpliftApp } from "@uplift-io/uplift";

export function createNextHandler(app: UpliftApp) {
  return {
    GET: async () => Response.json({ ok: true }),
    POST: (req: Request) => handleUploadRequest(app, req)
  };
}
