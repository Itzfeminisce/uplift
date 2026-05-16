import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { bunny } from "@uplift-io/bunny";
import { cloudinary } from "@uplift-io/cloudinary";
import { local } from "@uplift-io/local";
import { r2 } from "@uplift-io/r2";
import { audio, pdf, video } from "@uplift-io/rich";
import { s3 } from "@uplift-io/s3";
import { uploadthing } from "@uplift-io/uploadthing";

const body = new File(["hello"], "hello.txt", { type: "text/plain" });
const file = {
  name: "hello.txt",
  type: "text/plain",
  size: body.size,
  extension: "txt"
};

describe("storage adapters", () => {
  it("returns stable UploadedFile values from provider adapters", async () => {
    const sent: unknown[] = [];
    const okFetch: typeof fetch = async () => Response.json({ secure_url: "https://cdn.example.com/hello.txt", public_id: "hello.txt" });
    await expect(s3({
      bucket: "bucket",
      region: "us-east-1",
      client: { send: async (command) => { sent.push(command); } }
    }).put({ key: "hello.txt", file, body }))
      .resolves.toMatchObject({ provider: "s3", key: "hello.txt" });
    expect(sent).toHaveLength(1);
    await expect(r2({
      bucket: "bucket",
      accountId: "abc",
      client: { send: async (command) => { sent.push(command); } }
    }).put({ key: "hello.txt", file, body }))
      .resolves.toMatchObject({ provider: "r2", key: "hello.txt" });
    await expect(bunny({ apiKey: "key", zone: "zone", fetch: async () => new Response(null, { status: 201 }) }).put({ key: "hello.txt", file, body }))
      .resolves.toMatchObject({ provider: "bunny", key: "hello.txt" });
    await expect(cloudinary({ cloudName: "demo", uploadPreset: "unsigned", fetch: okFetch }).put({ key: "hello.txt", file, body }))
      .resolves.toMatchObject({ provider: "cloudinary", key: "hello.txt" });
  });

  it("does not fake Cloudinary success without upload configuration", async () => {
    await expect(cloudinary({ cloudName: "demo" }).put({ key: "hello.txt", file, body }))
      .rejects.toMatchObject({ code: "UPLOAD_FAILED" });
  });

  it("creates a local storage adapter", () => {
    expect(local("./uploads").provider).toBe("local");
  });

  it("preserves absolute public base URLs for local storage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "uplift-local-"));
    try {
      await expect(local(directory, { publicBaseUrl: "https://cdn.example.com/uploads" }).put({
        key: "avatars/hello.txt",
        file,
        body
      })).resolves.toMatchObject({
        url: "https://cdn.example.com/uploads/avatars/hello.txt"
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("uploads through an UploadThing-compatible server uploader", async () => {
    const calls: unknown[] = [];
    const adapter = uploadthing({
      uploader: async (fileToUpload) => {
        calls.push(fileToUpload);
        return {
          key: "utfs-key",
          url: "https://utfs.io/f/utfs-key",
          name: "hello.txt",
          type: "text/plain",
          size: 5
        };
      }
    });

    await expect(adapter.put({ key: "hello.txt", file, body }))
      .resolves.toMatchObject({
        provider: "uploadthing",
        key: "utfs-key",
        url: "https://utfs.io/f/utfs-key"
      });
    expect(calls).toHaveLength(1);
  });

  it("normalizes UploadThing UTApi uploadFiles responses", async () => {
    const adapter = uploadthing({
      uploader: async () => ({
        data: {
          key: "utfs-key",
          url: "https://utfs.io/f/utfs-key",
          name: "hello.txt",
          size: 5
        },
        error: null
      })
    });

    await expect(adapter.put({ key: "hello.txt", file, body }))
      .resolves.toMatchObject({
        provider: "uploadthing",
        key: "utfs-key",
        url: "https://utfs.io/f/utfs-key"
      });
  });

  it("turns UploadThing upload errors into upload failures", async () => {
    const adapter = uploadthing({
      uploader: async () => ({
        data: null,
        error: { code: "BAD_REQUEST", message: "Rejected by UploadThing", data: null }
      })
    });

    await expect(adapter.put({ key: "hello.txt", file, body }))
      .rejects.toMatchObject({
        code: "UPLOAD_FAILED",
        message: "Rejected by UploadThing"
      });
  });

  it("reads stored Original Upload bytes from local storage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "uplift-local-"));
    try {
      const adapter = local(directory);
      await adapter.put({ key: "originals/hello.txt", file, body });

      await expect(adapter.get?.("originals/hello.txt").then((stored) => stored?.text()))
        .resolves.toBe("hello");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("maps S3 storage headers and deletes objects by bucket and key", async () => {
    const sent: Array<{ input?: Record<string, unknown> }> = [];
    const adapter = s3({
      bucket: "bucket",
      region: "us-east-1",
      client: { send: async (command) => { sent.push(command as unknown as { input?: Record<string, unknown> }); } }
    });

    await adapter.put({
      key: "hello.txt",
      file,
      body,
      headers: {
        "Cache-Control": "public, max-age=60",
        "Content-Disposition": "attachment",
        "Content-Type": "application/ignored",
        Authorization: "Bearer secret"
      }
    });
    await adapter.delete?.("hello.txt");

    expect(sent[0]?.input).toMatchObject({
      Bucket: "bucket",
      Key: "hello.txt",
      ContentType: "text/plain",
      CacheControl: "public, max-age=60",
      ContentDisposition: "attachment"
    });
    expect(sent[0]?.input).not.toHaveProperty("Authorization");
    expect(sent[1]?.input).toMatchObject({ Bucket: "bucket", Key: "hello.txt" });
  });

  it("reads stored Original Upload bytes from S3-compatible storage", async () => {
    const sent: Array<{ input?: Record<string, unknown>; constructor: { name: string } }> = [];
    const adapter = s3({
      bucket: "bucket",
      region: "us-east-1",
      client: {
        send: async (command) => {
          sent.push(command as unknown as { input?: Record<string, unknown>; constructor: { name: string } });
          return {
            Body: {
              transformToByteArray: async () => new TextEncoder().encode("hello")
            },
            ContentType: "text/plain",
            ContentLength: 5
          };
        }
      }
    });

    await expect(adapter.get?.("originals/hello.txt").then((stored) => stored?.text()))
      .resolves.toBe("hello");
    expect(sent[0]?.constructor.name).toBe("GetObjectCommand");
    expect(sent[0]?.input).toMatchObject({ Bucket: "bucket", Key: "originals/hello.txt" });
  });

  it("lets R2 inherit S3-compatible put headers and delete behavior", async () => {
    const sent: Array<{ input?: Record<string, unknown> }> = [];
    const adapter = r2({
      bucket: "bucket",
      accountId: "abc",
      client: { send: async (command) => { sent.push(command as unknown as { input?: Record<string, unknown> }); } }
    });

    await adapter.put({
      key: "hello.txt",
      file,
      body,
      headers: { "Cache-Control": "public, max-age=60" }
    });
    await adapter.delete?.("hello.txt");

    expect(sent[0]?.input).toMatchObject({ CacheControl: "public, max-age=60" });
    expect(sent[1]?.input).toMatchObject({ Bucket: "bucket", Key: "hello.txt" });
  });

  it("reads stored Original Upload bytes from R2 storage", async () => {
    const adapter = r2({
      bucket: "bucket",
      accountId: "abc",
      client: {
        send: async () => ({
          Body: {
            transformToByteArray: async () => new TextEncoder().encode("hello")
          },
          ContentType: "text/plain",
          ContentLength: 5
        })
      }
    });

    await expect(adapter.get?.("originals/hello.txt").then((stored) => stored?.text()))
      .resolves.toBe("hello");
  });

  it("merges Bunny upload headers safely and deletes through storage credentials", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const adapter = bunny({
      apiKey: "key",
      zone: "zone",
      storageHostname: "storage.example.com",
      fetch: async (url, init) => {
        calls.push({ url: String(url), ...(init ? { init } : {}) });
        return new Response(null, { status: 201 });
      }
    });

    await adapter.put({
      key: "hello.txt",
      file,
      body,
      headers: {
        AccessKey: "route-key",
        "Content-Type": "application/ignored",
        "Cache-Control": "public, max-age=60"
      }
    });
    await adapter.delete?.("hello.txt");

    expect(calls[0]).toMatchObject({
      url: "https://storage.example.com/zone/hello.txt",
      init: {
        method: "PUT",
        headers: {
          AccessKey: "key",
          "Content-Type": "text/plain",
          "Cache-Control": "public, max-age=60"
        }
      }
    });
    expect(calls[1]).toMatchObject({
      url: "https://storage.example.com/zone/hello.txt",
      init: {
        method: "DELETE",
        headers: { AccessKey: "key" }
      }
    });
  });

  it("deletes UploadThing files through the configured deletion boundary", async () => {
    const uploadedInputs: unknown[] = [];
    const deleted: string[] = [];
    const adapter = uploadthing({
      uploader: async (_fileToUpload, input) => {
        uploadedInputs.push(input);
        return { key: "utfs-key", url: "https://utfs.io/f/utfs-key" };
      },
      deleter: async (key: string) => {
        deleted.push(key);
      }
    });

    await adapter.put({ key: "hello.txt", file, body, headers: { "Cache-Control": "public" } });
    await adapter.delete?.("utfs-key");

    expect(uploadedInputs).toHaveLength(1);
    expect(uploadedInputs[0]).toMatchObject({ key: "hello.txt", headers: { "Cache-Control": "public" } });
    expect(deleted).toEqual(["utfs-key"]);
  });

  it("keeps unsigned Cloudinary uploads working and enables signed cleanup when configured", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const adapter = cloudinary({
      cloudName: "demo",
      uploadPreset: "unsigned",
      apiKey: "api-key",
      apiSecret: "api-secret",
      invalidate: true,
      fetch: async (url, init) => {
        calls.push({ url: String(url), ...(init ? { init } : {}) });
        if (String(url).endsWith("/destroy")) return Response.json({ result: "ok" });
        return Response.json({ secure_url: "https://res.cloudinary.com/demo/hello.txt", public_id: "folder/hello", resource_type: "raw" });
      }
    });

    const uploaded = await adapter.put({ key: "folder/hello", file, body });
    await adapter.delete?.(uploaded.key);

    expect(uploaded).toMatchObject({ provider: "cloudinary", key: "folder/hello" });
    expect(calls[1]?.url).toBe("https://api.cloudinary.com/v1_1/demo/raw/destroy");
    const destroyBody = calls[1]?.init?.body as FormData;
    expect(destroyBody.get("public_id")).toBe("folder/hello");
    expect(destroyBody.get("api_key")).toBe("api-key");
    expect(destroyBody.get("invalidate")).toBe("true");
    expect(destroyBody.get("signature")).toEqual(expect.any(String));
  });
});

describe("rich exports", () => {
  it("adds inspection-heavy methods behind the rich entrypoint", () => {
    const pdfRoute = pdf().pages({ max: 10 }).encrypted(false) as unknown as {
      _def: { pageRule?: { max?: number }; encrypted?: boolean };
    };
    const videoRoute = video().duration({ max: "2m" }) as unknown as {
      _def: { durationRule?: { max?: "2m" } };
    };
    const audioRoute = audio().duration({ max: "5m" }) as unknown as {
      _def: { durationRule?: { max?: "5m" } };
    };

    expect(pdfRoute._def).toMatchObject({
      pageRule: { max: 10 },
      encrypted: false
    });
    expect(videoRoute._def.durationRule).toEqual({ max: "2m" });
    expect(audioRoute._def.durationRule).toEqual({ max: "5m" });
  });
});
