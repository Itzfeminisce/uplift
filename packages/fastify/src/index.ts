import { createRouteManifest, handleUploadRequest } from "@uplift-io/uplift/server";
import type { UpliftApp } from "@uplift-io/uplift";

type FastifyLike = {
  route(options: { method: string | string[]; url: string; handler(request: FastifyRequestLike, reply: unknown): Promise<Response> | Response }): void;
};

type HeaderValue = string | string[] | number | undefined;

type FastifyRequestLike = {
  raw: Request | {
    method?: string;
    url?: string;
    headers?: Record<string, HeaderValue>;
    body?: unknown;
  };
  protocol?: string;
  hostname?: string;
  headers?: Record<string, HeaderValue>;
};

export function createFastifyHandler(app: UpliftApp) {
  return (request: Request) => handleUploadRequest(app, request);
}

export function upliftFastify(app: UpliftApp, options: { url?: string } = {}) {
  return async (fastify: FastifyLike) => {
    fastify.route({
      method: ["HEAD", "GET", "POST"],
      url: options.url ?? "/upload",
      handler: async (request) => handleUploadRequest(app, requestFromFastify(request))
    });
  };
}

export function fastifyManifest(app: UpliftApp) {
  return createRouteManifest(app);
}

function requestFromFastify(request: FastifyRequestLike): Request {
  if (request.raw instanceof Request) return request.raw;
  const method = request.raw.method ?? "GET";
  const headers = headersFromRecord(request.headers ?? request.raw.headers);
  const url = absoluteUrl(request.raw.url ?? "/", request.protocol, request.hostname, headers);
  const init: RequestInit = { method, headers };
  const body = request.raw.body ?? bodyFromRaw(request.raw);
  if (body && method !== "GET" && method !== "HEAD") {
    Object.assign(init, { body, duplex: "half" });
  }
  return new Request(url, init);
}

function headersFromRecord(record: Record<string, HeaderValue> = {}): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string") headers.set(key, value);
    if (typeof value === "number") headers.set(key, String(value));
    if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  return headers;
}

function absoluteUrl(url: string, protocol: string | undefined, hostname: string | undefined, headers: Headers): string {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url)) return url;
  const host = hostname ?? headers.get("host") ?? "localhost";
  return `${protocol ?? "http"}://${host}${url.startsWith("/") ? url : `/${url}`}`;
}

function bodyFromRaw(raw: unknown): BodyInit | undefined {
  if (raw && typeof raw === "object" && (Symbol.asyncIterator in raw || "pipe" in raw || "read" in raw)) {
    return raw as unknown as BodyInit;
  }
  return undefined;
}
