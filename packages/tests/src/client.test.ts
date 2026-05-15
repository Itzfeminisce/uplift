import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { any, image, uplift } from "@uplift-io/uplift";
import { createUploadClient } from "@uplift-io/uplift/client";
import { createRouteManifest } from "@uplift-io/uplift/server";
import { createExpressHandler } from "@uplift-io/express";
import { createHonoHandler } from "@uplift-io/hono";
import { createMemoryStorage } from "@uplift-io/memory";
import { createNextHandler } from "@uplift-io/next";
import { upliftFastify } from "../../fastify/src/index";
import { createNuxtHandler } from "../../nuxt/src/index";

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

  it("attaches non-serializable output getters to parsed upload results", async () => {
    const upload = createUploadClient<typeof outputApp>("https://app.test/upload", {
      fetch: async () => Response.json({
        result: {
          url: "https://cdn.example.com/avatar.webp",
          key: "avatar.webp",
          name: "avatar.webp",
          type: "image/webp",
          size: 10,
          provider: "test",
          outputs: {
            thumb: {
              url: "https://cdn.example.com/avatar.webp/outputs/thumb.webp",
              key: "avatar.webp/outputs/thumb.webp",
              name: "thumb.webp",
              type: "image/webp",
              size: 4,
              provider: "test"
            }
          }
        }
      })
    });

    const result = await upload.avatar(new File(["test"], "avatar.png", { type: "image/png" }));
    expect(result.output("thumb").key).toBe("avatar.webp/outputs/thumb.webp");
    expect(Object.keys(result)).not.toContain("output");
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
    const nextHealth = await next.HEAD();
    const nextManifest = await next.GET();
    const honoHealth = await hono.fetch(new Request("https://app.test/upload", { method: "HEAD" }));
    const honoManifest = await hono.fetch(new Request("https://app.test/upload"));
    const nextResponse = await next.POST(uploadRequest("https://app.test/upload?route=attachment"));
    const honoResponse = await hono.fetch(uploadRequest("https://app.test/upload?route=attachment"));

    expect(nextHealth.status).toBe(204);
    expect(await nextHealth.text()).toBe("");
    expect(await nextManifest.json()).toEqual(createRouteManifest(app));
    expect(honoHealth.status).toBe(204);
    expect(await honoHealth.text()).toBe("");
    expect(await honoManifest.json()).toEqual(createRouteManifest(app));
    expect(nextResponse.status).toBe(200);
    expect(honoResponse.status).toBe(200);
  });

  it("supports route-scoped abort and same-route replacement controls", async () => {
    const signals: AbortSignal[] = [];
    let calls = 0;
    const upload = createUploadClient<typeof app>("https://app.test/upload", {
      fetch: async (_url, init) => {
        calls += 1;
        if (init?.signal) signals.push(init.signal as AbortSignal);
        if (calls === 1) {
          return new Promise((resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        }
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

    const first = upload.attachment(new File(["one"], "one.txt", { type: "text/plain" }));
    const second = upload.attachment(new File(["two"], "two.txt", { type: "text/plain" }));

    await expect(first).rejects.toMatchObject({ code: "ABORTED" });
    await expect(second).resolves.toMatchObject({ key: "file.txt" });
    expect(signals[0]?.aborted).toBe(true);
    await expect(upload.attachment.retry()).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    upload.attachment.abort();
    expect(calls).toBe(2);
  });

  it("retries failed and aborted attempts with the original file input", async () => {
    const uploadedNames: string[] = [];
    let failNext = true;
    let abortNext = true;
    const upload = createUploadClient<typeof app>("https://app.test/upload", {
      fetch: async (_url, init) => {
        const form = init?.body as FormData;
        const file = form.get("file") as File;
        uploadedNames.push(file.name);
        if (failNext) {
          failNext = false;
          return Response.json({ error: { code: "UPLOAD_FAILED", message: "Try again." } }, { status: 500 });
        }
        if (file.name === "aborted.txt" && abortNext) {
          abortNext = false;
          return new Promise((resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
          });
        }
        return Response.json({
          result: {
            url: `https://cdn.example.com/${file.name}`,
            key: file.name,
            name: file.name,
            type: file.type,
            size: file.size,
            provider: "test"
          }
        });
      }
    });

    await expect(upload.attachment(new File(["bad"], "failed.txt"))).rejects.toMatchObject({ code: "UPLOAD_FAILED" });
    await expect(upload.attachment.retry()).resolves.toMatchObject({ key: "failed.txt" });
    await expect(upload.attachment.retry()).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    const pending = upload.attachment(new File(["slow"], "aborted.txt"));
    upload.attachment.abort();
    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
    await expect(upload.attachment.retry()).resolves.toMatchObject({ key: "aborted.txt" });
    expect(uploadedNames).toEqual(["failed.txt", "failed.txt", "aborted.txt", "aborted.txt"]);
  });

  it("does not make successful uploads retryable", async () => {
    const upload = createUploadClient<typeof app>("https://app.test/upload", {
      fetch: async () => Response.json({
        result: {
          url: "https://cdn.example.com/file.txt",
          key: "file.txt",
          name: "file.txt",
          type: "text/plain",
          size: 4,
          provider: "test"
        }
      })
    });

    await expect(upload.attachment(new File(["test"], "file.txt"))).resolves.toMatchObject({ key: "file.txt" });
    await expect(upload.attachment.retry()).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: "No retryable upload attempt exists for route: attachment"
    });
  });

  it("rejects retry when a route has no retryable attempt", async () => {
    const upload = createUploadClient<typeof app>("https://app.test/upload", {
      fetch: async () => Response.json({ result: null })
    });

    await expect(upload.attachment.retry()).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: "No retryable upload attempt exists for route: attachment"
    });
  });

  it("checks preflight eligibility and exposes an upload continuation", async () => {
    const methods: string[] = [];
    const upload = createUploadClient<typeof app>("https://app.test/upload", {
      fetch: async (url, init) => {
        methods.push(`${init?.method} ${String(url)}`);
        if (String(url).includes("preflight=1")) {
          return Response.json({ ok: true });
        }
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

    const check = await upload.attachment.preflight(new File(["test"], "file.txt", { type: "text/plain" }));

    expect(check.ok).toBe(true);
    if (check.ok) {
      await expect(check.upload()).resolves.toMatchObject({ key: "file.txt" });
    }
    expect(methods).toEqual([
      "POST https://app.test/upload?route=attachment&preflight=1",
      "POST https://app.test/upload?route=attachment"
    ]);
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
    expect(JSON.parse(body).error.code).toBe("INVALID_REQUEST");
  });

  it("returns health and manifest responses from Express-style middleware", async () => {
    const handler = createExpressHandler(app);
    const calls: Array<{ status: number; body: string }> = [];

    for (const method of ["HEAD", "GET"]) {
      let status = 0;
      let body = "";
      await handler(
        {
          method,
          protocol: "https",
          originalUrl: "/upload",
          headers: { host: "app.test" }
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
      calls.push({ status, body });
    }

    expect(calls[0]).toEqual({ status: 204, body: "" });
    expect(calls[1]?.status).toBe(200);
    expect(JSON.parse(calls[1]?.body ?? "{}")).toEqual(createRouteManifest(app));
  });

  it("bridges Fastify-shaped requests to the framework-neutral handler", async () => {
    let registered: {
      method: string | string[];
      url: string;
      handler(request: unknown, reply: unknown): Promise<Response> | Response;
    } | undefined;
    await upliftFastify(app)({
      route(options) {
        registered = options;
      }
    });

    expect(registered?.method).toEqual(["HEAD", "GET", "POST"]);
    const handler = registered?.handler;
    if (!handler) throw new Error("Fastify route was not registered.");

    const health = await handler(fastifyRequest("HEAD", "https://app.test/upload"), {});
    const manifest = await handler(fastifyRequest("GET", "https://app.test/upload"), {});
    const preflight = await handler(
      fastifyRequest("POST", "https://app.test/upload?route=attachment&preflight=1", JSON.stringify({
        files: [{ name: "file.txt", type: "text/plain", size: 4 }]
      }), { "content-type": "application/json" }),
      {}
    );
    const uploadResponse = await handler(await fastifyUploadRequest("https://app.test/upload?route=attachment"), {});
    const failure = await handler(fastifyRequest("POST", "https://app.test/upload?route=attachment", "nope", { "content-type": "text/plain" }), {});

    expect(health.status).toBe(204);
    expect(await health.text()).toBe("");
    expect(await manifest.json()).toEqual(createRouteManifest(app));
    expect(await preflight.json()).toEqual({ ok: true });
    expect(uploadResponse.status).toBe(200);
    expect(failure.status).toBe(400);
    expect((await failure.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("bridges Nuxt-shaped requests with relative URLs to the framework-neutral handler", async () => {
    const handler = createNuxtHandler(app);

    const health = await handler(nuxtRequest("HEAD", "/upload"));
    const manifest = await handler(nuxtRequest("GET", "/upload"));
    const preflight = await handler(nuxtRequest("POST", "/upload?route=attachment&preflight=1", JSON.stringify({
      files: [{ name: "file.txt", type: "text/plain", size: 4 }]
    }), { "content-type": "application/json" }));
    const uploadResponse = await handler(await nuxtUploadRequest("/upload?route=attachment"));
    const failure = await handler(nuxtRequest("POST", "/upload?route=attachment", "nope", { "content-type": "text/plain" }));

    expect(health.status).toBe(204);
    expect(await health.text()).toBe("");
    expect(await manifest.json()).toEqual(createRouteManifest(app));
    expect(await preflight.json()).toEqual({ ok: true });
    expect(uploadResponse.status).toBe(200);
    expect(failure.status).toBe(400);
    expect((await failure.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("derives a safe route manifest without sensitive route internals", () => {
    const secretApp = uplift({
      storage: createMemoryStorage(),
      middleware: async () => ({ id: "user_1" }),
      routes: {
        avatar: image()
          .max("2mb")
          .multiple(3)
          .auth(async () => ({ id: "user_2" }))
          .key(() => "private/key")
          .validate(() => true)
          .done(() => undefined)
          .outputs({
            name: "thumb",
            produce: ({ body }) => body
          })
      }
    });

    expect(createRouteManifest(secretApp)).toEqual({
      routes: {
        avatar: {
          kind: "image",
          multiple: true,
          multipleLimit: 3,
          maxBytes: 2 * 1024 * 1024,
          mimeTypes: ["image/"],
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif"],
          outputs: ["thumb"]
        }
      }
    });
    expect(JSON.stringify(createRouteManifest(secretApp))).not.toContain("private/key");
  });
});

const app = uplift({
  storage: createMemoryStorage(),
  routes: {
    attachment: any()
  }
});

const outputApp = uplift({
  storage: createMemoryStorage(),
  routes: {
    avatar: any().outputs({
      name: "thumb",
      produce: async ({ body }) => new File([body], "thumb.webp", { type: "image/webp" })
    })
  }
});

function uploadRequest(url: string) {
  const form = new FormData();
  form.append("file", new File(["test"], "file.txt", { type: "text/plain" }));
  return new Request(url, { method: "POST", body: form });
}

function fastifyRequest(method: string, url: string, body?: BodyInit, headers: Record<string, string> = {}) {
  const parsed = new URL(url, "https://app.test");
  return {
    raw: {
      method,
      url: `${parsed.pathname}${parsed.search}`,
      headers: { host: parsed.host, ...headers },
      ...(body === undefined ? {} : { body: Readable.from([body]) })
    },
    protocol: parsed.protocol.slice(0, -1),
    hostname: parsed.host,
    headers: { host: parsed.host, ...headers }
  };
}

async function fastifyUploadRequest(url: string) {
  const request = uploadRequest(url);
  const parsed = new URL(url);
  return {
    raw: {
      method: "POST",
      url: `${parsed.pathname}${parsed.search}`,
      headers: Object.fromEntries(request.headers),
      body: Readable.from(Buffer.from(await request.arrayBuffer()))
    },
    protocol: parsed.protocol.slice(0, -1),
    hostname: parsed.host,
    headers: Object.fromEntries(request.headers)
  };
}

function nuxtRequest(method: string, url: string, body?: BodyInit, headers: Record<string, string> = {}) {
  return {
    node: {
      req: {
        method,
        url,
        headers: { host: "app.test", ...headers },
        ...(body === undefined ? {} : { body: Readable.from([body]) })
      }
    }
  };
}

async function nuxtUploadRequest(url: string) {
  const request = uploadRequest(`https://app.test${url}`);
  return {
    node: {
      req: {
        method: "POST",
        url,
        headers: { host: "app.test", ...Object.fromEntries(request.headers) },
        body: Readable.from(Buffer.from(await request.arrayBuffer()))
      }
    }
  };
}

function requestBody() {
  return new URLSearchParams();
}
