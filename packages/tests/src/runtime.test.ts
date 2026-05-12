import { describe, expect, it } from "vitest";
import { any, createMemoryStorage, image, json, uplift } from "../../src";
import { handleUploadRequest } from "../../src/server";

function file(name: string, type: string, body = "content") {
  return new File([body], name, { type });
}

describe("uplift runtime", () => {
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
      error: { code: "VALIDATION_FAILED" }
    });
    expect(written).toEqual([]);
  });
});
