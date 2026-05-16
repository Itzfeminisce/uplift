import { createRouteManifest, handleUploadRequest } from "@uplift-io/uplift/server";
import type { UpliftApp } from "@uplift-io/uplift";

export function createNextHandler(app: UpliftApp) {
  return {
    HEAD: async () => new Response(null, { status: 204 }),
    GET: async (req?: Request) => {
      if (req && new URL(req.url).searchParams.has("job")) return handleUploadRequest(app, req);
      return Response.json(createRouteManifest(app));
    },
    POST: (req: Request) => handleUploadRequest(app, req)
  };
}
