import { image, uplift, video } from "@uplift-io/uplift";
import { convert, resize, variant } from "@uplift-io/image";
import { poster, thumbnail, transcode, trim } from "@uplift-io/video";
import { s3 } from "@uplift-io/s3";

export const mediaUploads = uplift({
  storage: s3({
    bucket: process.env.S3_BUCKET!,
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!
  }),
  routes: {
    avatar: image()
      .headers({ "Cache-Control": "public, max-age=31536000" })
      .transform(resize({ width: 512, height: 512, fit: "cover" }), convert("webp"))
      .outputs(
        variant("thumb", resize({ width: 96, height: 96 }), convert("webp")),
        variant("preview", resize({ width: 320 }), convert("webp"))
      ),
    clip: video()
      .transform(trim({ start: "00:00:01", end: "00:00:10" }), transcode({ format: "mp4", codec: "h264" }))
      .outputs(thumbnail("thumb", { at: "25%" }), poster("poster", { at: "00:00:02" }))
  }
});

export type MediaUploads = typeof mediaUploads;

declare const upload: import("@uplift-io/uplift").UploadClient<MediaUploads>;

async function example(file: File) {
  const avatar = await upload.avatar(file);
  avatar.output("thumb").url;

  const clip = await upload.clip(file);
  clip.output("poster").url;
}

void example;
