import { describe, expect, it } from "vitest";
import { any, csv, image, json, uplift, video } from "@uplift-io/uplift";
import { handleUploadRequest } from "@uplift-io/uplift/server";
import { createMemoryStorage } from "@uplift-io/memory";
import { compress, convert, resize, strip, variant } from "@uplift-io/image";
import { extractAudio, resetVideoProcessor, setVideoProcessor, thumbnail, transcode, trim, type VideoOperation } from "@uplift-io/video";
import sharp from "sharp";

function file(name: string, type: string, body = "content") {
  return new File([body], name, { type });
}

async function imageFile(name = "avatar.png") {
  const body = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: "#4f46e5"
    }
  })
    .png()
    .toBuffer();
  return new File([toArrayBuffer(body)], name, { type: "image/png" });
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

describe("uplift runtime", () => {
  it("passes static storage headers to primary and output writes", async () => {
    const written: Array<{ key: string; headers?: Record<string, string> }> = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file, headers }) => {
          written.push({ key, ...(headers ? { headers } : {}) });
          return {
            key,
            url: `memory://${key}`,
            provider: "memory",
            name: file.name,
            type: file.type,
            size: file.size,
            extension: file.extension
          };
        }
      },
      routes: {
        avatar: image()
          .headers({ "Cache-Control": "public, max-age=31536000", "Content-Disposition": "inline" })
          .outputs({
            name: "thumb",
            produce: async ({ body }) => new File([body], "thumb.webp", { type: "image/webp" })
          })
          .key(({ file }) => `avatars/${file.name}`)
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(200);
    expect(written).toEqual([
      {
        key: "avatars/avatar.png",
        headers: { "Cache-Control": "public, max-age=31536000", "Content-Disposition": "inline" }
      },
      {
        key: "avatars/avatar.png/outputs/thumb.webp",
        headers: { "Cache-Control": "public, max-age=31536000", "Content-Disposition": "inline" }
      }
    ]);
  });

  it("resolves dynamic storage headers with request, file, user, and metadata context", async () => {
    const written: Array<{ key: string; headers?: Record<string, string> }> = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file, headers }) => {
          written.push({ key, ...(headers ? { headers } : {}) });
          return {
            key,
            url: `memory://${key}`,
            provider: "memory",
            name: file.name,
            type: file.type,
            size: file.size,
            extension: file.extension
          };
        }
      },
      routes: {
        avatar: image()
          .auth(async () => ({ id: "user_1" }))
          .meta(({ file, user }) => ({ owner: user.id, original: file.name }))
          .headers(({ req, file, user, meta }) => ({
            "Cache-Control": req.headers.get("x-cache") ?? "no-store",
            "X-File": file.name,
            "X-User": user.id,
            "X-Meta": `${meta.owner}:${meta.original}`
          }))
          .key(({ file }) => `avatars/${file.name}`)
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      headers: { "x-cache": "public, max-age=60" },
      body: form
    }));

    expect(response.status).toBe(200);
    expect(written).toEqual([
      {
        key: "avatars/avatar.png",
        headers: {
          "Cache-Control": "public, max-age=60",
          "X-File": "avatar.png",
          "X-User": "user_1",
          "X-Meta": "user_1:avatar.png"
        }
      }
    ]);
  });

  it("validates CSV columns and lets the last delimiter configuration win", async () => {
    const app = uplift({
      storage: createMemoryStorage(),
      routes: {
        semicolon: csv().columns(["email", "name"], { delimiter: "," }).delimiter(";"),
        pipe: csv().delimiter(";").columns(["email", "name"], { delimiter: "|" })
      }
    });

    const semicolonForm = new FormData();
    semicolonForm.append("file", file("users.csv", "text/csv", "email;name\na@example.com;Ada"));
    const semicolonResponse = await handleUploadRequest(app, new Request("https://app.test/upload/semicolon", {
      method: "POST",
      body: semicolonForm
    }));

    const pipeForm = new FormData();
    pipeForm.append("file", file("users.csv", "text/csv", "email|name\na@example.com|Ada"));
    const pipeResponse = await handleUploadRequest(app, new Request("https://app.test/upload/pipe", {
      method: "POST",
      body: pipeForm
    }));

    expect(semicolonResponse.status).toBe(200);
    expect(pipeResponse.status).toBe(200);
  });

  it("rejects CSV files whose columns do not match the route definition", async () => {
    const app = uplift({
      storage: createMemoryStorage(),
      routes: {
        import: csv().columns(["email", "name"])
      }
    });

    const form = new FormData();
    form.append("file", file("users.csv", "text/csv", "name,email\nAda,a@example.com"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/import", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED", message: "CSV columns do not match the route definition." }
    });
  });

  it("transforms the primary file before key generation and storage", async () => {
    const written: Array<{ key: string; file: { name: string; type: string; size: number; extension?: string }; body: string }> = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file, body }) => {
          written.push({
            key,
            file: file.extension
              ? { name: file.name, type: file.type, size: file.size, extension: file.extension }
              : { name: file.name, type: file.type, size: file.size },
            body: await body.text()
          });
          return {
            key,
            url: `memory://${key}`,
            provider: "memory",
            name: file.name,
            type: file.type,
            size: file.size,
            extension: file.extension
          };
        }
      },
      routes: {
        avatar: image()
          .transform(async ({ body }) => new File([`${await body.text()} optimized`], "avatar.webp", { type: "image/webp" }))
          .key(({ file }) => `avatars/${file.name}`)
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png", "raw"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        key: "avatars/avatar.webp",
        name: "avatar.webp",
        type: "image/webp",
        size: "raw optimized".length,
        extension: "webp"
      }
    });
    expect(written).toEqual([
      {
        key: "avatars/avatar.webp",
        file: {
          name: "avatar.webp",
          type: "image/webp",
          size: "raw optimized".length,
          extension: "webp"
        },
        body: "raw optimized"
      }
    ]);
  });

  it("writes named outputs derived from the transformed primary file", async () => {
    const written: Array<{ key: string; body: string; type: string }> = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file, body }) => {
          written.push({ key, body: await body.text(), type: file.type });
          return {
            key,
            url: `memory://${key}`,
            provider: "memory",
            name: file.name,
            type: file.type,
            size: file.size,
            extension: file.extension
          };
        }
      },
      routes: {
        avatar: image()
          .transform(async ({ body }) => new File([`${await body.text()} primary`], "avatar.webp", { type: "image/webp" }))
          .outputs({
            name: "thumb",
            produce: async ({ body }) => new File([`${await body.text()} thumb`], "thumb.webp", { type: "image/webp" })
          })
          .key(({ file }) => `avatars/${file.name}`)
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png", "raw"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        key: "avatars/avatar.webp",
        outputs: {
          thumb: {
            key: "avatars/avatar.webp/outputs/thumb.webp",
            type: "image/webp"
          }
        }
      }
    });
    expect(written).toEqual([
      { key: "avatars/avatar.webp", body: "raw primary", type: "image/webp" },
      { key: "avatars/avatar.webp/outputs/thumb.webp", body: "raw primary thumb", type: "image/webp" }
    ]);
  });

  it("propagates transform failures without writing to storage", async () => {
    const written: string[] = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => {
          written.push(key);
          return {
            key,
            url: `memory://${key}`,
            provider: "memory",
            name: file.name,
            type: file.type,
            size: file.size,
            extension: file.extension
          };
        }
      },
      routes: {
        avatar: image().transform(async () => {
          throw new Error("transform unavailable");
        })
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNKNOWN", message: "transform unavailable" }
    });
    expect(written).toEqual([]);
  });

  it("fails the upload when an output write fails", async () => {
    const written: string[] = [];
    const deleted: string[] = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => {
          written.push(key);
          if (key.includes("/outputs/")) throw new Error("output storage unavailable");
          return {
            key,
            url: `memory://${key}`,
            provider: "memory",
            name: file.name,
            type: file.type,
            size: file.size,
            extension: file.extension
          };
        },
        delete: async (key) => {
          deleted.push(key);
        }
      },
      routes: {
        avatar: image()
          .outputs({
            name: "thumb",
            produce: async ({ body }) => new File([body], "thumb.webp", { type: "image/webp" })
          })
          .key(({ file }) => `avatars/${file.name}`)
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNKNOWN", message: "output storage unavailable" }
    });
    expect(written).toEqual(["avatars/avatar.png", "avatars/avatar.png/outputs/thumb.webp"]);
    expect(deleted).toEqual(["avatars/avatar.png"]);
  });

  it("rolls back primary and output objects when a route completion handler fails", async () => {
    const deleted: string[] = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => ({
          key,
          url: `memory://${key}`,
          provider: "memory",
          name: file.name,
          type: file.type,
          size: file.size,
          extension: file.extension
        }),
        delete: async (key) => {
          deleted.push(key);
        }
      },
      routes: {
        avatar: image()
          .outputs({
            name: "thumb",
            produce: async ({ body }) => new File([body], "thumb.webp", { type: "image/webp" })
          })
          .key(({ file }) => `avatars/${file.name}`)
          .done(() => {
            throw new Error("database unavailable");
          })
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNKNOWN", message: "database unavailable" }
    });
    expect(deleted).toEqual(["avatars/avatar.png/outputs/thumb.webp", "avatars/avatar.png"]);
  });

  it("rolls back written objects when the global completion handler fails", async () => {
    const deleted: string[] = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => ({
          key,
          url: `memory://${key}`,
          provider: "memory",
          name: file.name,
          type: file.type,
          size: file.size,
          extension: file.extension
        }),
        delete: async (key) => {
          deleted.push(key);
        }
      },
      onUploadComplete: async () => {
        throw new Error("audit log unavailable");
      },
      routes: {
        avatar: image().key(({ file }) => `avatars/${file.name}`)
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNKNOWN", message: "audit log unavailable" }
    });
    expect(deleted).toEqual(["avatars/avatar.png"]);
  });

  it("rolls back all objects written before a multi-file route fails", async () => {
    const deleted: string[] = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => ({
          key,
          url: `memory://${key}`,
          provider: "memory",
          name: file.name,
          type: file.type,
          size: file.size,
          extension: file.extension
        }),
        delete: async (key) => {
          deleted.push(key);
        }
      },
      routes: {
        gallery: image()
          .multiple(3)
          .key(({ file }) => `gallery/${file.name}`)
          .validate(({ file }) => file.name === "bad.png" ? "bad file" : true)
      }
    });

    const form = new FormData();
    form.append("files", file("one.png", "image/png"));
    form.append("files", file("bad.png", "image/png"));
    form.append("files", file("two.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/gallery", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED", message: "bad file" }
    });
    expect(deleted).toEqual(["gallery/one.png"]);
  });

  it("does not roll back after a successful upload response", async () => {
    const deleted: string[] = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => ({
          key,
          url: `memory://${key}`,
          provider: "memory",
          name: file.name,
          type: file.type,
          size: file.size,
          extension: file.extension
        }),
        delete: async (key) => {
          deleted.push(key);
        }
      },
      routes: {
        avatar: image().key(({ file }) => `avatars/${file.name}`)
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(200);
    expect(deleted).toEqual([]);
  });

  it("preserves the original failure when rollback is unsupported or delete fails", async () => {
    const withoutDelete = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => ({
          key,
          url: `memory://${key}`,
          provider: "memory",
          name: file.name,
          type: file.type,
          size: file.size,
          extension: file.extension
        })
      },
      routes: {
        avatar: image().done(() => {
          throw new Error("database unavailable");
        })
      }
    });

    const missingDeleteForm = new FormData();
    missingDeleteForm.append("file", file("avatar.png", "image/png"));
    const missingDeleteResponse = await handleUploadRequest(withoutDelete, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: missingDeleteForm
    }));

    const deleteAttempts: string[] = [];
    const failingDelete = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => ({
          key,
          url: `memory://${key}`,
          provider: "memory",
          name: file.name,
          type: file.type,
          size: file.size,
          extension: file.extension
        }),
        delete: async (key) => {
          deleteAttempts.push(key);
          throw new Error("delete unavailable");
        }
      },
      routes: {
        avatar: image().key(({ file }) => `avatars/${file.name}`).done(() => {
          throw new Error("database unavailable");
        })
      }
    });

    const failingDeleteForm = new FormData();
    failingDeleteForm.append("file", file("avatar.png", "image/png"));
    const failingDeleteResponse = await handleUploadRequest(failingDelete, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: failingDeleteForm
    }));

    expect(missingDeleteResponse.status).toBe(500);
    await expect(missingDeleteResponse.json()).resolves.toMatchObject({
      error: { code: "UNKNOWN", message: "database unavailable" }
    });
    expect(failingDeleteResponse.status).toBe(500);
    await expect(failingDeleteResponse.json()).resolves.toMatchObject({
      error: { code: "UNKNOWN", message: "database unavailable" }
    });
    expect(deleteAttempts).toEqual(["avatars/avatar.png"]);
  });

  it("runs Sharp-backed image transforms and variants through storage", async () => {
    const written: Array<{ key: string; type: string; body: File }> = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file, body }) => {
          written.push({ key, type: file.type, body });
          return {
            key,
            url: `memory://${key}`,
            provider: "memory",
            name: file.name,
            type: file.type,
            size: file.size,
            extension: file.extension
          };
        }
      },
      routes: {
        avatar: image()
          .transform(resize({ width: 512, height: 512, fit: "cover" }), convert("webp"), compress({ quality: 82 }), strip())
          .outputs(
            variant("thumb", resize({ width: 96, height: 96 }), convert("webp")),
            variant("preview", resize({ width: 320 }), convert("webp"))
          )
          .key(({ file }) => `avatars/${file.name}`)
      }
    });

    const form = new FormData();
    form.append("file", await imageFile());
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        key: "avatars/avatar.webp",
        type: "image/webp",
        extension: "webp",
        outputs: {
          thumb: { key: "avatars/avatar.webp/outputs/thumb.webp", type: "image/webp" },
          preview: { key: "avatars/avatar.webp/outputs/preview.webp", type: "image/webp" }
        }
      }
    });
    expect(written.map((item) => item.key)).toEqual([
      "avatars/avatar.webp",
      "avatars/avatar.webp/outputs/thumb.webp",
      "avatars/avatar.webp/outputs/preview.webp"
    ]);
    const [primary, thumb, preview] = await Promise.all(
      written.map(async (item) => sharp(Buffer.from(await item.body.arrayBuffer())).metadata())
    );
    expect(primary).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(thumb).toMatchObject({ format: "webp", width: 96, height: 96 });
    expect(preview).toMatchObject({ format: "webp", width: 320 });
  });

  it("runs ffmpeg-compatible video transforms and derived outputs through storage", async () => {
    const written: Array<{ key: string; type: string }> = [];
    const operations: VideoOperation[] = [];
    try {
      setVideoProcessor(async ({ input, outputName, outputType, operation }) => {
        operations.push(operation);
        return new File([await input.arrayBuffer(), JSON.stringify(operation)], outputName, { type: outputType });
      });
      const app = uplift({
        storage: {
          provider: "memory",
          put: async ({ key, file }) => {
            written.push({ key, type: file.type });
            return {
              key,
              url: `memory://${key}`,
              provider: "memory",
              name: file.name,
              type: file.type,
              size: file.size,
              extension: file.extension
            };
          }
        },
        routes: {
          clip: video()
            .transform(trim({ start: "00:00:01", end: "00:00:03" }), transcode({ format: "mp4", codec: "h264" }))
            .outputs(thumbnail("thumb", { at: "50%" }), extractAudio("audio", { format: "mp3" }))
            .key(({ file }) => `clips/${file.name}`)
        }
      });

      const form = new FormData();
      form.append("file", file("clip.webm", "video/webm", "video-bytes"));
      const response = await handleUploadRequest(app, new Request("https://app.test/upload/clip", {
        method: "POST",
        body: form
      }));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        result: {
          key: "clips/clip.mp4",
          type: "video/mp4",
          extension: "mp4",
          outputs: {
            thumb: { key: "clips/clip.mp4/outputs/thumb.jpg", type: "image/jpeg" },
            audio: { key: "clips/clip.mp4/outputs/audio.mp3", type: "audio/mpeg" }
          }
        }
      });
      expect(written.map((item) => item.key)).toEqual([
        "clips/clip.mp4",
        "clips/clip.mp4/outputs/thumb.jpg",
        "clips/clip.mp4/outputs/audio.mp3"
      ]);
      expect(operations).toEqual([
        { type: "trim", options: { start: "00:00:01", end: "00:00:03" } },
        { type: "transcode", options: { format: "mp4", codec: "h264", audioCodec: "aac" } },
        { type: "thumbnail", options: { at: "50%" } },
        { type: "extractAudio", options: { format: "mp3" } }
      ]);
    } finally {
      resetVideoProcessor();
    }
  });

  it("uploads a single file through a typed route", async () => {
    const completed: string[] = [];
    const app = uplift({
      storage: createMemoryStorage(),
      routes: {
        avatar: image()
          .auth(async () => ({ id: "user_1" }))
          .max("2mb")
          .meta(({ user }) => ({ owner: user.id }))
          .key(({ user, file }) => `avatars/${user.id}/${file.name}`)
          .done(({ file, meta }) => {
            completed.push(`${meta.owner}:${file.key}`);
          })
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result).toMatchObject({
      key: "avatars/user_1/avatar.png",
      name: "avatar.png",
      provider: "memory"
    });
    expect(completed).toEqual(["user_1:avatars/user_1/avatar.png"]);
  });

  it("uploads multiple files when the route opts into multiple", async () => {
    const app = uplift({
      storage: createMemoryStorage(),
      routes: {
        gallery: image().multiple(2).key(({ file }) => `gallery/${file.name}`)
      }
    });

    const form = new FormData();
    form.append("files", file("one.png", "image/png"));
    form.append("files", file("two.jpg", "image/jpeg"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/gallery", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result).toHaveLength(2);
    expect(body.result[0].key).toBe("gallery/one.png");
  });

  it("returns stable upload errors for validation failures", async () => {
    const app = uplift({
      storage: createMemoryStorage(),
      routes: {
        avatar: image().max("1b")
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png", "too large"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "FILE_TOO_LARGE" }
    });
  });

  it("uses stable provider-neutral codes for request and route failures", async () => {
    const app = uplift({
      storage: createMemoryStorage(),
      routes: {
        avatar: image()
      }
    });

    const methodResponse = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "PUT"
    }));
    const routeResponse = await handleUploadRequest(app, new Request("https://app.test/upload/missing", {
      method: "POST",
      body: new FormData()
    }));
    const requestResponse = await handleUploadRequest(app, new Request("https://app.test/upload/avatar", {
      method: "POST",
      body: "not multipart"
    }));

    await expect(methodResponse.json()).resolves.toMatchObject({ error: { code: "METHOD_NOT_ALLOWED" } });
    await expect(routeResponse.json()).resolves.toMatchObject({ error: { code: "UNKNOWN_ROUTE" } });
    await expect(requestResponse.json()).resolves.toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it("runs preflight checks with auth, static constraints, and route hooks without file bytes", async () => {
    const app = uplift({
      storage: createMemoryStorage(),
      middleware: async () => ({ id: "user_1" }),
      routes: {
        avatar: image().max("4b").preflight(({ file, user }) => {
          user satisfies unknown;
          return file.name === "blocked.png" ? "blocked by policy" : true;
        })
      }
    });

    const ok = await handleUploadRequest(app, new Request("https://app.test/upload?route=avatar&preflight=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: [{ name: "avatar.png", type: "image/png", size: 4 }] })
    }));
    const tooLarge = await handleUploadRequest(app, new Request("https://app.test/upload?route=avatar&preflight=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: [{ name: "avatar.png", type: "image/png", size: 5 }] })
    }));
    const blocked = await handleUploadRequest(app, new Request("https://app.test/upload?route=avatar&preflight=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: [{ name: "blocked.png", type: "image/png", size: 4 }] })
    }));

    await expect(ok.json()).resolves.toEqual({ ok: true });
    await expect(tooLarge.json()).resolves.toMatchObject({ ok: false, error: { code: "PREFLIGHT_FAILED" } });
    await expect(blocked.json()).resolves.toEqual({
      ok: false,
      error: { code: "PREFLIGHT_FAILED", message: "blocked by policy" }
    });
  });

  it("supports public routes that override router middleware", async () => {
    const app = uplift({
      storage: createMemoryStorage(),
      middleware: async () => {
        throw new Error("blocked");
      },
      routes: {
        attachment: any().overrideAuth()
      }
    });

    const form = new FormData();
    form.append("file", file("note.txt", "text/plain"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/attachment", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(200);
  });

  it("validates JSON uploads with any schema that has parse", async () => {
    const app = uplift({
      storage: createMemoryStorage(),
      routes: {
        import: json().schema({
          parse(input: unknown) {
            if (typeof input === "object" && input !== null && "ok" in input) return input;
            throw new Error("missing ok");
          }
        })
      }
    });

    const form = new FormData();
    form.append("file", file("data.json", "application/json", "{\"nope\":true}"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload/import", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" }
    });
  });

  it("passes per-file metadata arrays to multiple route completion handlers", async () => {
    const completed: string[][] = [];
    const app = uplift({
      storage: createMemoryStorage(),
      routes: {
        gallery: image()
          .multiple(2)
          .meta(({ file }) => ({ original: file.name }))
          .done(({ meta }) => {
            completed.push(meta.map((item) => item.original));
          })
      }
    });

    const form = new FormData();
    form.append("files", file("one.png", "image/png"));
    form.append("files", file("two.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload?route=gallery", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(200);
    expect(completed).toEqual([["one.png", "two.png"]]);
  });

  it("fails closed for rich inspection validators that are configured without an inspector", async () => {
    const app = uplift({
      storage: createMemoryStorage(),
      routes: {
        avatar: image().dimensions({ maxWidth: 100 })
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload?route=avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_FAILED" }
    });
  });

  it("does not run completion hooks when storage fails", async () => {
    const completed: string[] = [];
    const app = uplift({
      storage: {
        provider: "broken",
        put: async () => {
          throw new Error("storage offline");
        }
      },
      onUploadComplete: async () => {
        completed.push("app");
      },
      routes: {
        avatar: image().done(() => {
          completed.push("route");
        })
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload?route=avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(500);
    expect(completed).toEqual([]);
  });

  it("rejects unsafe storage keys before writing to the adapter", async () => {
    const written: string[] = [];
    const app = uplift({
      storage: {
        provider: "memory",
        put: async ({ key, file }) => {
          written.push(key);
          return {
            key,
            url: `memory://${key}`,
            provider: "memory",
            name: file.name,
            type: file.type,
            size: file.size,
            extension: file.extension
          };
        }
      },
      routes: {
        avatar: image().key(() => "../avatar.png")
      }
    });

    const form = new FormData();
    form.append("file", file("avatar.png", "image/png"));
    const response = await handleUploadRequest(app, new Request("https://app.test/upload?route=avatar", {
      method: "POST",
      body: form
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNSAFE_STORAGE_KEY" }
    });
    expect(written).toEqual([]);
  });
});
