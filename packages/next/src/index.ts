import { createRouteManifest, handleUploadRequest } from "@uplift-io/uplift/server";
import type { UpliftApp } from "@uplift-io/uplift";

export function createNextHandler(app: UpliftApp) {
  return {
    HEAD: async () => new Response(null, { status: 204 }),
    GET: async () => Response.json(createRouteManifest(app)),
    POST: (req: Request) => handleUploadRequest(app, req)
  };
}
