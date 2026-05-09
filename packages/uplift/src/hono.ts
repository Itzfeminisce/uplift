import { handleUploadRequest } from "./server";
import type { UpliftApp } from "./types";

export function createHonoHandler(app: UpliftApp) {
  return {
    fetch: (req: Request) => handleUploadRequest(app, req)
  };
}
