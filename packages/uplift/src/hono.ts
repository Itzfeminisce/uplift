import { Hono } from "hono";
import { handleUploadRequest } from "./server";
import type { UpliftApp } from "./types";

export function createHonoHandler(app: UpliftApp) {
  const router = new Hono();
  router.get("/", (context) => context.json({ ok: true }));
  router.post("/", (context) => handleUploadRequest(app, context.req.raw));
  router.post("*", (context) => handleUploadRequest(app, context.req.raw));
  return router;
}
