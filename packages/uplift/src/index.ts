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
  type AnyUploadBuilder,
  type AudioExtension,
  type AudioUploadBuilder,
  type CsvUploadBuilder,
  type DimensionRule,
  type DurationRule,
  type ImageExtension,
  type ImageUploadBuilder,
  type JsonUploadBuilder,
  type PageRule,
  type PdfUploadBuilder,
  type SharedUploadBuilder,
  type TextEncoding,
  type TextExtension,
  type TextUploadBuilder,
  type UploadBuilderForKind,
  type VideoUploadBuilder,
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
  type StorageHeaders,
  type StorageHeadersConfig,
  type StorageHeadersContext,
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
  return config as unknown as UpliftApp<TRoutes>;
}
