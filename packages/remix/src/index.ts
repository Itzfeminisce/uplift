import { handleUploadRequest } from "@uplift-io/uplift/server";
import type { UpliftApp } from "@uplift-io/uplift";

type RemixArgs = { request: Request };

export function createRemixHandler(app: UpliftApp) {
  return {
    loader: ({ request }: RemixArgs) => handleUploadRequest(app, request),
    action: ({ request }: RemixArgs) => handleUploadRequest(app, request)
  };
}
