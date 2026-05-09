import { useMemo, useState } from "react";
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
    RouteState<ClientOutput<TApp["routes"][TRouteName]>>;

export type ReactUploadClient<TApp extends UpliftApp> = {
  [TRouteName in keyof TApp["routes"] & string]: ReactUploadMethod<TApp, TRouteName>;
};

export function useUploads<TApp extends UpliftApp>(baseUrl: string): ReactUploadClient<TApp> {
  const [states, setStates] = useState<Record<string, RouteState<unknown>>>({});

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
        const state = states[property] ?? emptyState();
        const method = async (input: never) => {
          setStates((current) => ({
            ...current,
            [property]: { ...(current[property] ?? emptyState()), isUploading: true, error: null }
          }));
          try {
            const upload = (client as Record<string, (value: never) => Promise<unknown>>)[property];
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

        return Object.assign(method, state);
      }
    }) as ReactUploadClient<TApp>;
  }, [baseUrl, states]);
}

function emptyState(): RouteState<unknown> {
  return {
    progress: 0,
    isUploading: false,
    error: null,
    data: null
  };
}
