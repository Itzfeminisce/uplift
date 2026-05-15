import { handleUploadRequest } from "@uplift-io/uplift/server";
import type { UpliftApp } from "@uplift-io/uplift";

type HeaderValue = string | string[] | number | undefined;
type H3EventLike = {
  request?: Request;
  node?: {
    req?: {
      method?: string;
      url?: string;
      headers?: Record<string, HeaderValue>;
      body?: unknown;
    };
  };
};

export function createNuxtHandler(app: UpliftApp) {
  return (event: H3EventLike | Request) => {
    if (event instanceof Request) return handleUploadRequest(app, event);
    if (event.request) return handleUploadRequest(app, event.request);
    const method = event.node?.req?.method ?? "GET";
    const url = event.node?.req?.url ?? "/upload";
    const headers = headersFromRecord(event.node?.req?.headers);
    const init: RequestInit = { method, headers };
    const body = event.node?.req?.body ?? bodyFromRaw(event.node?.req);
    if (body && method !== "GET" && method !== "HEAD") {
      Object.assign(init, { body, duplex: "half" });
    }
    return handleUploadRequest(app, new Request(absoluteUrl(url, headers), init));
  };
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

function absoluteUrl(url: string, headers: Headers): string {
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url)) return url;
  const host = headers.get("host") ?? "localhost";
  return `http://${host}${url.startsWith("/") ? url : `/${url}`}`;
}

function bodyFromRaw(raw: unknown): BodyInit | undefined {
  if (raw && typeof raw === "object" && (Symbol.asyncIterator in raw || "pipe" in raw || "read" in raw)) {
    return raw as unknown as BodyInit;
  }
  return undefined;
}
