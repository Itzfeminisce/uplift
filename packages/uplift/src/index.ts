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
  type ClientUploadedFile,
  type ClientInput,
  type ClientOutput,
  type CompatibleOutput,
  type CompatibleTransform,
  type DoneContext,
  type KeyContext,
  type Middleware,
  type OutputContext,
  type OutputNames,
  type PreparedUploadFile,
  type SizeValue,
  type StandardSchema,
  type StorageAdapter,
  type StoragePutInput,
  type TransformContext,
  type UploadedFile,
  type UploadOutput,
  type UploadErrorCode,
  type UploadInputFile,
  type UploadTransform,
  type UploadTransformFunction,
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
