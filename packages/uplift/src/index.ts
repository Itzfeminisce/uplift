export {
  any,
  audio,
  csv,
  custom,
  image,
  json,
  pdf,
  text,
  UploadBuilder,
  video,
  type AudioExtension,
  type DimensionRule,
  type DurationRule,
  type ImageExtension,
  type PageRule,
  type TextEncoding,
  type TextExtension,
  type VideoExtension
} from "./builder";
export { createUploadClient } from "./client";
// export { createMemoryStorage } from "./storage/memory";
export {
  UploadError,
  type ClientInput,
  type ClientOutput,
  type DoneContext,
  type KeyContext,
  type Middleware,
  type SizeValue,
  type StandardSchema,
  type StorageAdapter,
  type UploadedFile,
  type UploadErrorCode,
  type UploadInputFile,
  type UploadClient,
  type UpliftApp
} from "./types";

import type { Middleware, StorageAdapter, UpliftApp, UploadRoutes } from "./types";

export function uplift<TRoutes extends UploadRoutes>(config: {
  storage: StorageAdapter;
  routes: TRoutes;
  middleware?: Middleware<unknown>;
  onUploadComplete?: UpliftApp<TRoutes>["onUploadComplete"];
}): UpliftApp<TRoutes> {
  return config;
}
