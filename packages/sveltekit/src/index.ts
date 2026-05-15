import { handleUploadRequest } from "@uplift-io/uplift/server";
import type { UpliftApp } from "@uplift-io/uplift";

type SvelteKitEvent = { request: Request };

export function createSvelteKitHandler(app: UpliftApp) {
  return {
    HEAD: ({ request }: SvelteKitEvent) => handleUploadRequest(app, request),
    GET: ({ request }: SvelteKitEvent) => handleUploadRequest(app, request),
    POST: ({ request }: SvelteKitEvent) => handleUploadRequest(app, request)
  };
}
