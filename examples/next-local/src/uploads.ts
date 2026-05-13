import { image, uplift, video } from "@uplift-io/uplift";
import { convert, resize, variant } from "@uplift-io/image";
import { local } from "@uplift-io/local";
import { r2 } from "@uplift-io/r2";
import { s3 } from "@uplift-io/s3";
import { thumbnail, transcode, trim } from "@uplift-io/video";

const storage = (() => {
  if (process.env.UPLIFT_STORAGE === "s3") {
    return s3({
      bucket: process.env.S3_BUCKET!,
      region: process.env.S3_REGION ?? "us-east-1",
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    });
  }

  if (process.env.UPLIFT_STORAGE === "r2") {
    return r2({
      bucket: process.env.R2_BUCKET!,
      accountId: process.env.R2_ACCOUNT_ID!,
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    });
  }

  return local(process.env.UPLIFT_LOCAL_DIR ?? "./public/uploads", {
    publicBaseUrl: process.env.UPLIFT_PUBLIC_BASE_URL ?? "/uploads",
  });
})();

export const uploads = uplift({
  storage,
  routes: {
    avatar: image()
      .max("2mb")
      .auth(async ({ req }) => ({
        id: req.headers.get("x-user-id") ?? "demo-user",
      }))
      .key(({ user, file }) => `avatars/${user.id}/${file.name}`),
    gallery: image()
      .max("8mb")
      .multiple(10)
      .key(({ file }) => `gallery/${Date.now()}-${file.name}`),
    mediaPreview: image()
      .max("4mb")
      .transform(resize({ width: 512, fit: "inside" }), convert("webp"))
      .outputs(
        variant("thumb", resize({ width: 96, height: 96, fit: "cover" }), convert("webp")),
        variant("preview", resize({ width: 320, fit: "inside" }), convert("webp")),
      )
      .key(({ file }) => `media/images/${Date.now()}-${file.name}`),
    clip: video()
      .max("25mb")
      .transform(trim({ start: "00:00:00" }), transcode({ format: "mp4", codec: "h264" }))
      .outputs(thumbnail("thumb", { at: "25%" }))
      .key(({ file }) => `media/videos/${Date.now()}-${file.name}`),
  },
});

export type Uploads = typeof uploads;
