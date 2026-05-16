import { Hono } from "hono";
import { createRouteManifest, handleUploadRequest } from "@uplift-io/uplift/server";
import type { UpliftApp } from "@uplift-io/uplift";

export function createHonoHandler(app: UpliftApp) {
  const router = new Hono();
  router.get("/", (context) => {
    if (new URL(context.req.raw.url).searchParams.has("job")) return handleUploadRequest(app, context.req.raw);
    return context.json(createRouteManifest(app));
  });
  router.on("HEAD", "/", () => new Response(null, { status: 204 }));
  router.on("HEAD", "*", () => new Response(null, { status: 204 }));
  router.on("HEAD", "/*", () => new Response(null, { status: 204 }));
  router.post("/", (context) => handleUploadRequest(app, context.req.raw));
  router.post("*", (context) => handleUploadRequest(app, context.req.raw));
  const fetch = router.fetch.bind(router);
  router.fetch = (request, ...rest) => {
    if (request.method === "HEAD") return Promise.resolve(new Response(null, { status: 204 }));
    if (request.method === "GET" && new URL(request.url).searchParams.has("job")) {
      return handleUploadRequest(app, request);
    }
    if (request.method === "GET") return Promise.resolve(Response.json(createRouteManifest(app)));
    return fetch(request, ...rest);
  };
  return router;
}
