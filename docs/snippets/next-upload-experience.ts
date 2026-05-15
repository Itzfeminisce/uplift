import { image, uplift } from "@uplift-io/uplift";
import { createUploadClient } from "@uplift-io/uplift/client";
import { createOpenApiDocument } from "@uplift-io/openapi";
import { createRouteManifest } from "@uplift-io/uplift/server";
import { createMemoryStorage } from "@uplift-io/memory";

export const uploads = uplift({
  storage: createMemoryStorage(),
  routes: {
    avatar: image()
      .max("2mb")
      .preflight(({ file }) => file.size > 0 || "Empty files are not eligible yet.")
  }
});

const manifest = createRouteManifest(uploads);
export const openapi = createOpenApiDocument(manifest, { path: "/api/upload" });

const upload = createUploadClient<typeof uploads>("/api/upload");

export async function chooseAvatar(file: File) {
  const check = await upload.avatar.preflight(file);
  if (!check.ok) return check.error.message;

  const uploaded = await check.upload();
  upload.avatar.abort();
  await upload.avatar.retry();
  return uploaded.url;
}
