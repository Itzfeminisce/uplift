import {
  any,
  audio,
  type AsyncTransformQueue,
  type AsyncTransformHandle,
  csv,
  custom,
  image,
  json,
  pdf,
  text,
  type AsyncTransformsConfig,
  type UploadedFile,
  uplift,
  video
} from "@uplift-io/uplift";
import { asyncTransforms as redisAsyncTransforms, type RedisLike } from "@uplift-io/redis";
import { createUploadClient } from "@uplift-io/uplift/client";
import { resize as resizeImage, variant } from "@uplift-io/image";
import { thumbnail, trim } from "@uplift-io/video";

const app = uplift({
  storage: {
    provider: "test",
    put: async ({ key, file }) => ({
      url: `https://cdn.example.com/${key}`,
      key,
      name: file.name,
      type: file.type,
      size: file.size,
      provider: "test"
    })
  },
  routes: {
    avatar: image()
      .auth(async () => ({ id: "user_1" }))
      .max("2mb")
      .meta(({ user }) => ({ owner: user.id }))
      .done(({ file, user, meta }) => {
        file satisfies UploadedFile;
        user.id satisfies string;
        meta.owner satisfies string;
      }),
    gallery: image()
      .auth(async () => ({ id: "user_1" }))
      .multiple(10)
      .meta(({ file }) => ({ name: file.name }))
      .done(({ files, user, meta }) => {
        files satisfies UploadedFile[];
        user.id satisfies string;
        meta[0]?.name satisfies string | undefined;
      }),
    publicAttachment: any().overrideAuth().done(({ user }) => {
      // @ts-expect-error Public routes do not get an arbitrary typed user.
      user.id;
    }),
    optimizedAvatar: image()
      .transform(resizeImage({ width: 128 }))
      .outputs(variant("thumb", resizeImage({ width: 32 })))
  }
});

const upload = createUploadClient<typeof app>("/upload");

upload.avatar(new File(["avatar"], "avatar.png")) satisfies Promise<UploadedFile>;
upload.avatar.abort() satisfies void;
upload.avatar.retry() satisfies Promise<UploadedFile>;
upload.gallery([new File(["one"], "one.png")]) satisfies Promise<UploadedFile[]>;
upload.gallery(new DataTransfer().files) satisfies Promise<UploadedFile[]>;
upload.optimizedAvatar(new File(["avatar"], "avatar.png")).then((file) => {
  file.output("thumb") satisfies UploadedFile;
  // @ts-expect-error Only declared outputs can be accessed.
  file.output("preview");
});

// @ts-expect-error Single file routes do not accept arrays.
upload.avatar([new File(["avatar"], "avatar.png")]);

// @ts-expect-error Multi-file routes do not accept a single File.
upload.gallery(new File(["one"], "one.png"));

image().transform(resizeImage({ width: 64 }));
// @ts-expect-error Video transforms are not accepted by image routes.
image().transform(trim({ start: "00:00:01" }));

// @ts-expect-error Image outputs are not accepted by video routes.
video().outputs(variant("thumb", resizeImage({ width: 32 })));
video().transform(trim({ start: "00:00:01" })).outputs(thumbnail("poster", { at: "25%" }));

const asyncApp = uplift({
  storage: {
    provider: "test",
    put: async ({ key, file }) => ({
      url: `https://cdn.example.com/${key}`,
      key,
      name: file.name,
      type: file.type,
      size: file.size,
      provider: "test"
    })
  },
  asyncTransforms: {
    keepOriginal: "failed"
  },
  routes: {
    clip: video().transformAsync(trim({ start: "00:00:01" }), { timeout: "5m" })
  }
});

asyncApp.asyncTransforms?.keepOriginal satisfies false | "failed" | true | undefined;
const asyncUpload = createUploadClient<typeof asyncApp>("/upload");
asyncUpload.clip(new File(["clip"], "clip.mp4", { type: "video/mp4" })) satisfies Promise<AsyncTransformHandle>;
asyncUpload.clip(new File(["clip"], "clip.mp4", { type: "video/mp4" })).then((transform) => {
  transform.id satisfies string;
  transform.route satisfies string;
  transform.status satisfies "queued" | "processing" | "completed" | "failed";
  transform.done() satisfies Promise<UploadedFile>;
});
({ keepOriginal: false } satisfies AsyncTransformsConfig);
({ keepOriginal: true } satisfies AsyncTransformsConfig);
({ keepOriginal: "failed" } satisfies AsyncTransformsConfig);
({ keepOriginal: false, queueName: "uplift:async", timeout: "10m" } satisfies AsyncTransformsConfig);
// @ts-expect-error keepOriginal only accepts false, "failed", or true.
({ keepOriginal: "always" } satisfies AsyncTransformsConfig);

const typedQueue = {
  create: async (input) => ({
    id: "job_1",
    route: input.route,
    status: "queued" as const,
    original: {
      key: input.original.key ?? "original",
      file: input.original.file
    },
    metadata: input.metadata,
    user: input.user,
    keepOriginal: input.keepOriginal,
    createdAt: new Date(),
    updatedAt: new Date()
  }),
  read: async () => undefined,
  claimNext: async () => undefined,
  claim: async () => undefined,
  releaseOriginalBody: async () => {
    throw new Error("unused");
  },
  complete: async () => {
    throw new Error("unused");
  },
  fail: async () => {
    throw new Error("unused");
  },
  shouldDeleteOriginal: () => false
} satisfies AsyncTransformQueue;

const redisLike = {
  get: async (_key: string) => null,
  set: async (_key: string, _value: string) => "OK",
  del: async (_key: string) => 1,
  lpush: async (_key: string, _value: string) => 1,
  rpop: async (_key: string) => null,
  zadd: async (_key: string, _score: number, _member: string) => 1,
  zrangebyscore: async (_key: string, _min: number | string, _max: number | string) => [],
  zrem: async (_key: string, _member: string) => 1
} satisfies RedisLike;

redisAsyncTransforms(redisLike, {
  queueName: "uplift:async-transforms",
  keepOriginal: "failed",
  timeout: "5m"
}) satisfies AsyncTransformsConfig;

// @ts-expect-error Redis-backed async transforms require a Queue Name.
redisAsyncTransforms(redisLike, {});

uplift({
  storage: {
    provider: "test",
    put: async ({ key, file }) => ({
      url: `https://cdn.example.com/${key}`,
      key,
      name: file.name,
      type: file.type,
      size: file.size,
      provider: "test"
    })
  },
  asyncTransforms: { queue: typedQueue, queueName: "uploads:async", timeout: "5m", keepOriginal: false },
  routes: {
    clip: video().transformAsync(trim({ start: "00:00:01" }))
  }
});

image().transformAsync(resizeImage({ width: 64 }));
image().transformAsync(resizeImage({ width: 64 }), {});
image().transformAsync(resizeImage({ width: 64 }), { timeout: "30s" });
// @ts-expect-error Video transforms are not accepted by async image routes.
image().transformAsync(trim({ start: "00:00:01" }));

const asyncMultipleApp = uplift({
  storage: {
    provider: "test",
    put: async ({ key, file }) => ({
      url: `https://cdn.example.com/${key}`,
      key,
      name: file.name,
      type: file.type,
      size: file.size,
      provider: "test"
    })
  },
  asyncTransforms: { keepOriginal: false },
  routes: {
    clips: video().multiple(2).transformAsync(trim({ start: "00:00:01" }))
  }
});
const asyncMultipleUpload = createUploadClient<typeof asyncMultipleApp>("/upload");
asyncMultipleUpload.clips(new File(["clip"], "clip.mp4", { type: "video/mp4" })) satisfies Promise<AsyncTransformHandle>;
// @ts-expect-error Async transform routes are single-file client contracts even if a route is misconfigured as multiple.
asyncMultipleUpload.clips([new File(["clip"], "clip.mp4", { type: "video/mp4" })]);

video()
  .auth(async () => ({ id: "user_1" }))
  .meta(({ user }) => ({ owner: user.id }))
  .outputs(thumbnail("poster", { at: "25%" }))
  .listeners({
    queued: ({ user, meta }) => {
      user.id satisfies string;
      meta.owner satisfies string;
    },
    completed: ({ result }) => {
      result.output("poster") satisfies UploadedFile;
      // @ts-expect-error Only declared outputs can be accessed.
      result.output("preview");
    }
  });

// @ts-expect-error Async routes require root asyncTransforms config.
uplift({
  storage: {
    provider: "test",
    put: async ({ key, file }) => ({
      url: `https://cdn.example.com/${key}`,
      key,
      name: file.name,
      type: file.type,
      size: file.size,
      provider: "test"
    })
  },
  routes: {
    clip: video().transformAsync(trim({ start: "00:00:01" }))
  }
});

uplift({
  storage: {
    provider: "test",
    put: async ({ key, file }) => ({
      url: `https://cdn.example.com/${key}`,
      key,
      name: file.name,
      type: file.type,
      size: file.size,
      provider: "test"
    })
  },
  // @ts-expect-error Root asyncTransforms requires at least one async route.
  asyncTransforms: { keepOriginal: false },
  routes: {
    avatar: image()
  }
});

// @ts-expect-error Internal route definitions are not exposed on public builders.
image()._def;

// @ts-expect-error Internal type metadata is not exposed on public builders.
image().__multiple;

csv().columns(["email"]).delimiter(",");
csv().columns(["email"], { delimiter: ";" });
image().dimensions({ maxWidth: 100 }).square().aspectRatio("1:1");
pdf().pages({ max: 10 }).encrypted(false);
video().duration({ max: "2m" });

image().headers({ "Cache-Control": "public, max-age=31536000" });
video().headers({ "Cache-Control": "public, max-age=31536000" });
audio().headers({ "Cache-Control": "public, max-age=31536000" });
pdf().headers({ "Content-Disposition": "attachment" });
text().headers({ "Cache-Control": "no-store" });
json().headers({ "Cache-Control": "no-store" });
csv().headers({ "Cache-Control": "no-store" });
custom("application/octet-stream").headers({ "Cache-Control": "no-store" });
any().headers({ "Cache-Control": "no-store" });

image()
  .auth(async () => ({ id: "user_1" }))
  .meta(({ user }) => ({ owner: user.id }))
  .headers(({ req, file, user, meta }) => {
    req satisfies Request;
    file.name satisfies string;
    user.id satisfies string;
    meta.owner satisfies string;
    return { "Cache-Control": `private, max-age=60`, "X-Owner": meta.owner };
  })
  .dimensions({ maxWidth: 100 });

// @ts-expect-error CSV column validation moved to columns().
csv().headers(["email"]);

// @ts-expect-error Image-only dimension checks are not exposed on CSV routes.
csv().dimensions({ maxWidth: 100 });

// @ts-expect-error PDF-only page checks are not exposed on image routes.
image().pages({ max: 10 });

// @ts-expect-error Image-only dimension checks are not exposed on PDF routes.
pdf().dimensions({ maxWidth: 100 });

// @ts-expect-error Video-only duration checks are not exposed on image routes.
image().duration({ max: "2m" });

image()
  .auth(async () => ({ id: "user_1" }))
  .meta(({ user }) => ({ owner: user.id }))
  .headers({ "Cache-Control": "public, max-age=60" })
  .dimensions({ maxWidth: 100 });
