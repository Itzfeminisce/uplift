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
