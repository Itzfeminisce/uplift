import { any, image, type UploadedFile, uplift } from "../src";
import { createUploadClient } from "../src/client";

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
  middleware: async () => ({ id: "user_1" }),
  routes: {
    avatar: image()
      .max("2mb")
      .meta(({ user }) => ({ owner: user.id }))
      .done(({ file, user, meta }) => {
        file satisfies UploadedFile;
        user.id satisfies string;
        meta.owner satisfies string;
      }),
    gallery: image()
      .multiple(10)
      .done(({ files, user }) => {
        files satisfies UploadedFile[];
        user.id satisfies string;
      }),
    publicAttachment: any().overrideAuth()
  }
});

const upload = createUploadClient<typeof app>("/upload");

upload.avatar(new File(["avatar"], "avatar.png")) satisfies Promise<UploadedFile>;
upload.gallery([new File(["one"], "one.png")]) satisfies Promise<UploadedFile[]>;
upload.gallery(new DataTransfer().files) satisfies Promise<UploadedFile[]>;

// @ts-expect-error Single file routes do not accept arrays.
upload.avatar([new File(["avatar"], "avatar.png")]);

// @ts-expect-error Multi-file routes do not accept a single File.
upload.gallery(new File(["one"], "one.png"));
