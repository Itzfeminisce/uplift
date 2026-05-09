import { image, pdf, uplift } from "uplift";
import { s3 } from "uplift/storage/s3";

export const uploads = uplift({
  storage: s3({
    bucket: process.env.S3_BUCKET!,
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!
  }),
  routes: {
    avatar: image()
      .max("2mb")
      .auth(async ({ req }) => ({ id: req.headers.get("x-user-id")! }))
      .key(({ user }) => `avatars/${user.id}.png`),
    resume: pdf().max("5mb"),
    gallery: image().max("8mb").multiple(10)
  }
});

export type Uploads = typeof uploads;
