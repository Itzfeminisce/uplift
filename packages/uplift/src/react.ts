import { useMemo, useRef, useState } from "react";
import { createUploadClient } from "./client";
import type { ClientInput, ClientOutput, UpliftApp, UploadError } from "./types";

type RouteState<TData> = {
  progress: number;
  isUploading: boolean;
  error: UploadError | null;
  data: TData | null;
};

type ReactUploadMethod<TApp extends UpliftApp, TRouteName extends keyof TApp["routes"] & string> =
  ((input: ClientInput<TApp["routes"][TRouteName]>) => Promise<ClientOutput<TApp["routes"][TRouteName]>>) &
    RouteState<ClientOutput<TApp["routes"][TRouteName]>> & {
      abort(): void;
      retry(): Promise<ClientOutput<TApp["routes"][TRouteName]>>;
      preflight(input: ClientInput<TApp["routes"][TRouteName]>): Promise<
        | ({ ok: true; upload(): Promise<ClientOutput<TApp["routes"][TRouteName]>> })
        | { ok: false; error: { code: string; message: string } }
      >;
    };

export type ReactUploadClient<TApp extends UpliftApp> = {
  [TRouteName in keyof TApp["routes"] & string]: ReactUploadMethod<TApp, TRouteName>;
};

export function useUploads<TApp extends UpliftApp>(baseUrl: string): ReactUploadClient<TApp> {
  const [states, setStates] = useState<Record<string, RouteState<unknown>>>({});
  const latestStates = useRef(states);
  latestStates.current = states;

  return useMemo(() => {
    const client = createUploadClient<TApp>(baseUrl, {
      onProgress(route, progress) {
        setStates((current) => ({
          ...current,
          [route]: { ...(current[route] ?? emptyState()), progress }
        }));
      }
    });

    return new Proxy({}, {
      get(_target, property) {
        if (typeof property !== "string") return undefined;
        const state = latestStates.current[property] ?? emptyState();
        const method = async (input: never) => {
          setStates((current) => ({
            ...current,
            [property]: { ...(current[property] ?? emptyState()), isUploading: true, error: null }
          }));
          try {
            const upload = (client as Record<string, ((value: never) => Promise<unknown>) | undefined>)[property];
            if (!upload) throw new Error(`Unknown upload route: ${property}`);
            const data = await upload(input);
            setStates((current) => ({
              ...current,
              [property]: { progress: 100, isUploading: false, error: null, data }
            }));
            return data;
          } catch (error) {
            setStates((current) => ({
              ...current,
              [property]: { ...(current[property] ?? emptyState()), isUploading: false, error: error as UploadError }
            }));
            throw error;
          }
        };

        return Object.assign(method, state, {
          abort() {
            const upload = (client as Record<string, { abort?: () => void } | undefined>)[property];
            upload?.abort?.();
          },
          async retry() {
            setStates((current) => ({
              ...current,
              [property]: { ...(current[property] ?? emptyState()), isUploading: true, error: null }
            }));
            try {
              const upload = (client as Record<string, { retry?: () => Promise<unknown> } | undefined>)[property];
              if (!upload?.retry) throw new Error(`Unknown upload route: ${property}`);
              const data = await upload.retry();
              setStates((current) => ({
                ...current,
                [property]: { progress: 100, isUploading: false, error: null, data }
              }));
              return data;
            } catch (error) {
              setStates((current) => ({
                ...current,
                [property]: { ...(current[property] ?? emptyState()), isUploading: false, error: error as UploadError }
              }));
              throw error;
            }
          },
          async preflight(input: never) {
            const upload = (client as Record<string, { preflight?: (value: never) => Promise<unknown> } | undefined>)[property];
            if (!upload?.preflight) throw new Error(`Unknown upload route: ${property}`);
            return upload.preflight(input);
          }
        });
      }
    }) as ReactUploadClient<TApp>;
  }, [baseUrl]);
}

function emptyState(): RouteState<unknown> {
  return {
    progress: 0,
    isUploading: false,
    error: null,
    data: null
  };
}
