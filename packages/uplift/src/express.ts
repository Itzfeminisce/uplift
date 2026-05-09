import { handleUploadRequest } from "./server";
import type { UpliftApp } from "./types";

type ExpressRequest = {
  method: string;
  protocol?: string;
  originalUrl?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: BodyInit | null;
};

type ExpressResponse = {
  status(code: number): ExpressResponse;
  setHeader(name: string, value: string): void;
  send(body: string): void;
};

export function createExpressHandler(app: UpliftApp) {
  return async (req: ExpressRequest, res: ExpressResponse) => {
    const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
    const url = `${req.protocol ?? "http"}://${host ?? "localhost"}${req.originalUrl ?? req.url ?? "/"}`;
    const request = new Request(url, {
      method: req.method,
      headers: headersFromExpress(req.headers),
      body: req.body ?? null
    });
    const response = await handleUploadRequest(app, request);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.send(await response.text());
  };
}

function headersFromExpress(headers: ExpressRequest["headers"]): Headers {
  const next = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") next.set(key, value);
    if (Array.isArray(value)) next.set(key, value.join(", "));
  }
  return next;
}
