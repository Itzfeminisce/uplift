import { image, uplift } from "uplift-io";
import { local } from "uplift-io/storage/local";
import { r2 } from "uplift-io/storage/r2";
import { s3 } from "uplift-io/storage/s3";

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

  return local(process.env.UPLIFT_LOCAL_DIR ?? "./uploads");
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
  },
});

export type Uploads = typeof uploads;
