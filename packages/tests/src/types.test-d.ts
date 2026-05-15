import { any, audio, csv, custom, image, json, pdf, text, type UploadedFile, uplift, video } from "@uplift-io/uplift";
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
