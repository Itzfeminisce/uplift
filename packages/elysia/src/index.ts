import { handleUploadRequest } from "@uplift-io/uplift/server";
import type { UpliftApp } from "@uplift-io/uplift";

type ElysiaLike = {
  head(path: string, handler: (context: { request: Request }) => Response | Promise<Response>): ElysiaLike;
  get(path: string, handler: (context: { request: Request }) => Response | Promise<Response>): ElysiaLike;
  post(path: string, handler: (context: { request: Request }) => Response | Promise<Response>): ElysiaLike;
};

export function createElysiaHandler(app: UpliftApp) {
  return (request: Request) => handleUploadRequest(app, request);
}

export function upliftElysia(app: UpliftApp, options: { path?: string } = {}) {
  return (elysia: ElysiaLike) => {
    const path = options.path ?? "/upload";
    return elysia
      .head(path, ({ request }) => handleUploadRequest(app, request))
      .get(path, ({ request }) => handleUploadRequest(app, request))
      .post(path, ({ request }) => handleUploadRequest(app, request));
  };
}
