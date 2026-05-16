import { createRequire } from "node:module";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpliftApp } from "@uplift-io/uplift";
import type { ReactUploadClient } from "@uplift-io/uplift/react";

type StateUpdater<T> = T | ((current: T) => T);
type AttachmentApp = UpliftApp & { routes: { attachment: UpliftApp["routes"][string] } };

let hookStates: unknown[] = [];
let hookDeps: unknown[][] = [];
let hookIndex = 0;

const require = createRequire(import.meta.url);
const React = require("../../uplift/node_modules/react") as {
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: {
    H: unknown;
  };
};
const reactInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
const dispatcher = {
  useMemo<T>(factory: () => T, deps: unknown[]): T {
    const index = hookIndex++;
    const previous = hookDeps[index];
    const changed = !previous || previous.length !== deps.length || previous.some((dep, depIndex) => dep !== deps[depIndex]);
    if (changed) {
      hookStates[index] = factory();
      hookDeps[index] = deps;
    }
    return hookStates[index] as T;
  },
  useRef<T>(initial: T): { current: T } {
    const index = hookIndex++;
    if (hookStates[index] === undefined) hookStates[index] = { current: initial };
    return hookStates[index] as { current: T };
  },
  useState<T>(initial: T): [T, (updater: StateUpdater<T>) => void] {
    const index = hookIndex++;
    if (hookStates[index] === undefined) hookStates[index] = initial;
    return [
      hookStates[index] as T,
      (updater) => {
        const current = hookStates[index] as T;
        hookStates[index] = typeof updater === "function" ? (updater as (value: T) => T)(current) : updater;
      }
    ];
  }
};

describe("React upload hook", () => {
  beforeEach(() => {
    hookStates = [];
    hookDeps = [];
    hookIndex = 0;
    reactInternals.H = dispatcher;
  });

  it("keeps retry memory after failed attempts trigger rerenders", async () => {
    const { useUploads } = await import("@uplift-io/uplift/react");
    let failNext = true;
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      const file = form.get("file") as File;
      calls.push(file.name);
      if (failNext) {
        failNext = false;
        return Response.json({ error: { code: "UPLOAD_FAILED", message: "Try again." } }, { status: 500 });
      }
      return Response.json({ result: uploadResult(file.name) });
    });

    const first = renderHook(useUploads);
    await expect(attachment(first)(new File(["bad"], "failed.txt"))).rejects.toMatchObject({ code: "UPLOAD_FAILED" });

    const second = renderHook(useUploads);
    await expect(attachment(second).retry()).resolves.toMatchObject({ key: "failed.txt" });
    expect(calls).toEqual(["failed.txt", "failed.txt"]);

    vi.unstubAllGlobals();
  });

  it("keeps retry memory after aborted attempts trigger rerenders", async () => {
    const { useUploads } = await import("@uplift-io/uplift/react");
    vi.stubGlobal("fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        setTimeout(() => resolve(Response.json({ result: uploadResult("aborted.txt") })), 5);
      });
    });

    const first = renderHook(useUploads);
    const firstAttachment = attachment(first);
    const pending = firstAttachment(new File(["slow"], "aborted.txt"));
    firstAttachment.abort();
    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });

    vi.stubGlobal("fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      const file = form.get("file") as File;
      return Response.json({ result: uploadResult(file.name) });
    });

    const second = renderHook(useUploads);
    await expect(attachment(second).retry()).resolves.toMatchObject({ key: "aborted.txt" });

    vi.unstubAllGlobals();
  });

  it("preserves previous successful data when a later attempt is aborted", async () => {
    const { useUploads } = await import("@uplift-io/uplift/react");
    let call = 0;
    vi.stubGlobal("fetch", async (_url: string | URL | Request, init?: RequestInit) => {
      call += 1;
      if (call === 1) return Response.json({ result: uploadResult("done.txt") });
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    });

    const first = renderHook(useUploads);
    await expect(attachment(first)(new File(["done"], "done.txt"))).resolves.toMatchObject({ key: "done.txt" });

    const second = renderHook(useUploads);
    const secondAttachment = attachment(second);
    const pending = secondAttachment(new File(["slow"], "slow.txt"));
    secondAttachment.abort();
    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });

    const third = renderHook(useUploads);
    expect(attachment(third).data).toMatchObject({ key: "done.txt" });
    expect(attachment(third).error).toMatchObject({ code: "ABORTED" });

    vi.unstubAllGlobals();
  });

  it("keeps retried async transforms in lifecycle state until done resolves", async () => {
    const { useUploads } = await import("@uplift-io/uplift/react");
    const completed = deferred<Response>();
    let call = 0;
    vi.stubGlobal("fetch", async (url: string | URL | Request) => {
      call += 1;
      if (call === 1) {
        return Response.json({ error: { code: "UPLOAD_FAILED", message: "Try again." } }, { status: 500 });
      }
      if (String(url).includes("job=job_1")) return completed.promise;
      return Response.json({ result: { id: "job_1", route: "attachment", status: "queued" } });
    });

    const first = renderHook(useUploads);
    await expect(attachment(first)(new File(["bad"], "failed.txt"))).rejects.toMatchObject({ code: "UPLOAD_FAILED" });

    const second = renderHook(useUploads);
    await expect(attachment(second).retry()).resolves.toMatchObject({ id: "job_1", status: "queued" });

    const queued = renderHook(useUploads);
    expect(attachment(queued).status).toBe("queued");
    expect(attachment(queued).progress).toBeNull();
    expect(attachment(queued).data).toBeNull();

    completed.resolve(Response.json({
      id: "job_1",
      route: "attachment",
      status: "completed",
      result: uploadResult("completed.txt")
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const final = renderHook(useUploads);
    expect(attachment(final).status).toBe("completed");
    expect(attachment(final).data).toMatchObject({ key: "completed.txt" });

    vi.unstubAllGlobals();
  });
});

function renderHook(useUploads: <TApp extends UpliftApp>(baseUrl: string) => ReactUploadClient<TApp>) {
  hookIndex = 0;
  return useUploads<AttachmentApp>("https://app.test/upload");
}

function attachment(client: ReactUploadClient<AttachmentApp>) {
  const route = client.attachment;
  if (!route) throw new Error("attachment route was not available");
  return route;
}

function uploadResult(name: string) {
  return {
    url: `https://cdn.example.com/${name}`,
    key: name,
    name,
    type: "text/plain",
    size: 4,
    provider: "test"
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
