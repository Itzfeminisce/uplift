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
    await expect(s3({ bucket: "bucket", region: "us-east-1" }).put({ key: "hello.txt", file, body }))
      .resolves.toMatchObject({ provider: "s3", key: "hello.txt" });
    await expect(r2({ bucket: "bucket", accountId: "abc" }).put({ key: "hello.txt", file, body }))
      .resolves.toMatchObject({ provider: "r2", key: "hello.txt" });
    await expect(bunny({ apiKey: "key", zone: "zone" }).put({ key: "hello.txt", file, body }))
      .resolves.toMatchObject({ provider: "bunny", key: "hello.txt" });
    await expect(cloudinary({ cloudName: "demo" }).put({ key: "hello.txt", file, body }))
      .resolves.toMatchObject({ provider: "cloudinary", key: "hello.txt" });
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
