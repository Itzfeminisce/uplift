import { describe, expect, it } from "vitest";
import { any, uplift } from "@uplift-io/uplift";
import { createUploadClient } from "@uplift-io/uplift/client";
import { createExpressHandler } from "@uplift-io/express";
import { createHonoHandler } from "@uplift-io/hono";
import { createMemoryStorage } from "@uplift-io/memory";
import { createNextHandler } from "@uplift-io/next";

describe("upload clients and adapters", () => {
  it("posts route-named multipart requests and returns uploaded results", async () => {
    const upload = createUploadClient<typeof app>("https://app.test/upload", {
      fetch: async (url, init) => {
        expect(String(url)).toBe("https://app.test/upload?route=attachment");
        expect(init?.method).toBe("POST");
        return Response.json({
          result: {
            url: "https://cdn.example.com/file.txt",
            key: "file.txt",
            name: "file.txt",
            type: "text/plain",
            size: 4,
            provider: "test"
          }
        });
      }
    });

    const result = await upload.attachment(new File(["test"], "file.txt", { type: "text/plain" }));
    expect(result.key).toBe("file.txt");
  });

  it("throws UploadError-shaped failures from the server", async () => {
    const upload = createUploadClient<typeof app>("https://app.test/upload", {
      fetch: async () => Response.json(
        { error: { code: "VALIDATION_FAILED", message: "Nope." } },
        { status: 400 }
      )
    });

    await expect(upload.attachment(new File(["test"], "file.txt"))).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: "Nope."
    });
  });

  it("adapts the framework-neutral handler to Next.js and Hono", async () => {
    const next = createNextHandler(app);
    const hono = createHonoHandler(app);
    const nextResponse = await next.POST(uploadRequest("https://app.test/upload?route=attachment"));
    const honoResponse = await hono.fetch(uploadRequest("https://app.test/upload?route=attachment"));

    expect(nextResponse.status).toBe(200);
    expect(honoResponse.status).toBe(200);
  });

  it("adapts the framework-neutral handler to Express-style middleware", async () => {
    const handler = createExpressHandler(app);
    let status = 0;
    let body = "";

    await handler(
      {
        method: "POST",
        protocol: "https",
        originalUrl: "/upload?route=attachment",
        headers: { host: "app.test", "content-type": "text/plain" },
        body: requestBody()
      },
      {
        status(code) {
          status = code;
          return this;
        },
        setHeader() {},
        send(value) {
          body = value;
        }
      }
    );

    expect(status).toBe(400);
    expect(JSON.parse(body).error.code).toBe("VALIDATION_FAILED");
  });
});

const app = uplift({
  storage: createMemoryStorage(),
  routes: {
    attachment: any()
  }
});

function uploadRequest(url: string) {
  const form = new FormData();
  form.append("file", new File(["test"], "file.txt", { type: "text/plain" }));
  return new Request(url, { method: "POST", body: form });
}

function requestBody() {
  return new URLSearchParams();
}
