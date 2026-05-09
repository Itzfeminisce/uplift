import { describe, expect, it } from "vitest";
import { audio, pdf, video } from "../src/rich";
import { bunny } from "../src/storage/bunny";
import { cloudinary } from "../src/storage/cloudinary";
import { local } from "../src/storage/local";
import { r2 } from "../src/storage/r2";
import { s3 } from "../src/storage/s3";

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
});

describe("rich exports", () => {
  it("adds inspection-heavy methods behind the rich entrypoint", () => {
    expect(pdf().pages({ max: 10 }).encrypted(false)._def).toMatchObject({
      pageRule: { max: 10 },
      encrypted: false
    });
    expect(video().duration({ max: "2m" })._def.durationRule).toEqual({ max: "2m" });
    expect(audio().duration({ max: "5m" })._def.durationRule).toEqual({ max: "5m" });
  });
});
