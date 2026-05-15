import { handleUploadRequest } from "@uplift-io/uplift/server";
import type { UpliftApp } from "@uplift-io/uplift";

export function createTanStackStartHandler(app: UpliftApp) {
  return {
    HEAD: ({ request }: { request: Request }) => handleUploadRequest(app, request),
    GET: ({ request }: { request: Request }) => handleUploadRequest(app, request),
    POST: ({ request }: { request: Request }) => handleUploadRequest(app, request)
  };
}
