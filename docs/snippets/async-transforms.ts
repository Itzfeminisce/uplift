import { uplift, video, type AsyncTransformHandle, type UploadedFile } from "@uplift-io/uplift";
import { createUploadClient } from "@uplift-io/uplift/client";
import { runNextTransformJob } from "@uplift-io/uplift/server";
import { createMemoryStorage } from "@uplift-io/memory";
import { asyncTransforms, type RedisLike } from "@uplift-io/redis";
import { thumbnail, trim, transcode } from "@uplift-io/video";

declare const redis: RedisLike;

export const uploads = uplift({
  storage: createMemoryStorage(),
  asyncTransforms: asyncTransforms(redis, {
    queueName: "uplift:async-transforms",
    keepOriginal: "failed",
    claimVisibilityTimeoutMs: 300_000
  }),
  routes: {
    clip: video()
      .transformAsync(trim({ start: "00:00:01" }), transcode({ format: "mp4" }), { timeout: "10m" })
      .outputs(thumbnail("poster", { at: "25%" }))
      .listeners({
        queued: ({ id, route }) => {
          console.info("Queued Transform Job", route, id);
        },
        processing: ({ progress }) => {
          console.info("Processing", progress?.message ?? "working");
        },
        completed: ({ result }) => {
          result.outputs?.poster;
        },
        failed: ({ error }) => {
          console.error(error.code, error.message);
        }
      })
  }
});

export type Uploads = typeof uploads;

const upload = createUploadClient<Uploads>("/api/upload");
const transform = await upload.clip(new File(["clip"], "clip.mp4", { type: "video/mp4" }));
transform satisfies AsyncTransformHandle<"poster">;

const completed = await transform.done();
(completed as UploadedFile & { output(name: "poster"): UploadedFile }).output("poster");

await runNextTransformJob(uploads);
