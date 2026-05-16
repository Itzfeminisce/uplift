import {
  type DoneContext,
  type DurationValue,
  type KeyContext,
  type Middleware,
  type PreflightContext,
  type AsyncTransformRouteOptions,
  type AsyncTransformListeners,
  type CompatibleOutput,
  type CompatibleTransform,
  type SizeValue,
  type StandardSchema,
  type StorageHeadersConfig,
  type UploadInputFile,
  type UploadKind,
  type UploadOutput,
  type UploadRouteConfig,
  type UploadRouteDefinition
} from "./types";
import { parseSize } from "./utils";

export type ImageExtension = "png" | "jpg" | "jpeg" | "webp" | "gif" | "avif";
export type VideoExtension = "mp4" | "webm" | "mov" | "avi" | "mkv";
export type AudioExtension = "mp3" | "wav" | "ogg" | "m4a" | "aac" | "flac";
export type TextExtension = "txt" | "md" | "log";
export type TextEncoding = "utf-8" | "utf-16" | "ascii";

export type DimensionRule = {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
};

export type PageRule = {
  min?: number;
  max?: number;
};

export type DurationRule = {
  min?: DurationValue;
  max?: DurationValue;
};

export type UploadBuilderForKind<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TKind extends UploadKind = UploadKind,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> = TKind extends "image"
  ? ImageUploadBuilder<TAuth, TMeta, TMultiple, TOutputNames, TAsync>
  : TKind extends "pdf"
    ? PdfUploadBuilder<TAuth, TMeta, TMultiple, TOutputNames, TAsync>
    : TKind extends "video"
      ? VideoUploadBuilder<TAuth, TMeta, TMultiple, TOutputNames, TAsync>
      : TKind extends "audio"
        ? AudioUploadBuilder<TAuth, TMeta, TMultiple, TOutputNames, TAsync>
        : TKind extends "text"
          ? TextUploadBuilder<TAuth, TMeta, TMultiple, TOutputNames, TAsync>
          : TKind extends "json"
            ? JsonUploadBuilder<TAuth, TMeta, TMultiple, TOutputNames, TAsync>
            : TKind extends "csv"
              ? CsvUploadBuilder<TAuth, TMeta, TMultiple, TOutputNames, TAsync>
              : TKind extends "custom"
                ? CustomUploadBuilder<TAuth, TMeta, TMultiple, TOutputNames, TAsync>
                : TKind extends "any"
                  ? AnyUploadBuilder<TAuth, TMeta, TMultiple, TOutputNames, TAsync>
                  : SharedUploadBuilder<TAuth, TMeta, TMultiple, TKind, TOutputNames, TAsync>;

export interface SharedUploadBuilder<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TKind extends UploadKind = UploadKind,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> extends UploadRouteConfig<TAuth, TMeta, TMultiple, TKind, TOutputNames, TAsync> {
  max(size: SizeValue): this;
  min(size: SizeValue): this;
  multiple(count?: number): UploadBuilderForKind<TAuth, TMeta, true, TKind, TOutputNames, TAsync>;
  auth<TUser>(handler: Middleware<TUser>): UploadBuilderForKind<TUser, TMeta, TMultiple, TKind, TOutputNames, TAsync>;
  overrideAuth(): this;
  key(handler: (ctx: KeyContext<TAuth, TMeta>) => string | Promise<string>): this;
  meta<TNextMeta>(
    handler: (ctx: {
      req: Request;
      file: UploadInputFile;
      user: TAuth;
    }) => TNextMeta | Promise<TNextMeta>
  ): UploadBuilderForKind<TAuth, TNextMeta, TMultiple, TKind, TOutputNames, TAsync>;
  validate(
    handler: (ctx: {
      req: Request;
      file: UploadInputFile;
      user: TAuth;
      meta: TMeta;
    }) => true | string | Promise<true | string>
  ): this;
  preflight(handler: (ctx: PreflightContext<TAuth>) => true | string | Promise<true | string>): this;
  headers(headers: StorageHeadersConfig<TAuth, TMeta>): this;
  done(handler: (ctx: DoneContext<TAuth, TMeta, TMultiple>) => void | Promise<void>): this;
  listeners(listeners: AsyncTransformListeners<TAuth, TMeta, TOutputNames>): this;
  types(types: string[]): this;
  transform(...transforms: Array<CompatibleTransform<TKind>>): this;
  transformAsync(
    ...transforms: Array<CompatibleTransform<TKind>>
  ): UploadBuilderForKind<TAuth, TMeta, TMultiple, TKind, TOutputNames, true>;
  transformAsync(
    ...transformsAndOptions: [...Array<CompatibleTransform<TKind>>, AsyncTransformRouteOptions]
  ): UploadBuilderForKind<TAuth, TMeta, TMultiple, TKind, TOutputNames, true>;
  outputs<const TName extends string>(
    ...outputs: Array<CompatibleOutput<TKind, TName>>
  ): UploadBuilderForKind<TAuth, TMeta, TMultiple, TKind, TOutputNames | TName, TAsync>;
}

export interface AnyUploadBuilder<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> extends SharedUploadBuilder<TAuth, TMeta, TMultiple, "any", TOutputNames, TAsync> {}

export interface ImageUploadBuilder<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> extends SharedUploadBuilder<TAuth, TMeta, TMultiple, "image", TOutputNames, TAsync> {
  dimensions(rule: DimensionRule): this;
  square(): this;
  aspectRatio(value: `${number}:${number}`): this;
}

export interface PdfUploadBuilder<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> extends SharedUploadBuilder<TAuth, TMeta, TMultiple, "pdf", TOutputNames, TAsync> {
  pages(rule: PageRule): this;
  encrypted(value: boolean): this;
}

export interface VideoUploadBuilder<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> extends SharedUploadBuilder<TAuth, TMeta, TMultiple, "video", TOutputNames, TAsync> {
  duration(rule: DurationRule): this;
}

export interface AudioUploadBuilder<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> extends SharedUploadBuilder<TAuth, TMeta, TMultiple, "audio", TOutputNames, TAsync> {
  duration(rule: DurationRule): this;
}

export interface TextUploadBuilder<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> extends SharedUploadBuilder<TAuth, TMeta, TMultiple, "text", TOutputNames, TAsync> {
  encoding(value: TextEncoding): this;
}

export interface JsonUploadBuilder<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> extends SharedUploadBuilder<TAuth, TMeta, TMultiple, "json", TOutputNames, TAsync> {
  schema<TSchema extends StandardSchema>(schema: TSchema): this;
}

export interface CsvUploadBuilder<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> extends SharedUploadBuilder<TAuth, TMeta, TMultiple, "csv", TOutputNames, TAsync> {
  columns(headers: string[], options?: { delimiter?: "," | ";" | "\t" | "|" }): this;
  delimiter(value: "," | ";" | "\t" | "|"): this;
}

export interface CustomUploadBuilder<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> extends SharedUploadBuilder<TAuth, TMeta, TMultiple, "custom", TOutputNames, TAsync> {}

export class UploadBuilder<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TKind extends UploadKind = UploadKind,
  TOutputNames extends string = never,
  TAsync extends boolean = false
> {
  readonly _def: UploadRouteDefinition;

  constructor(kind: TKind, mimeTypes: string[] = [], extensions: string[] = []) {
    this._def = {
      kind,
      multiple: false,
      overrideAuth: false
    };
    if (mimeTypes.length > 0) this._def.mimeTypes = mimeTypes;
    if (extensions.length > 0) this._def.extensions = extensions;
  }

  max(size: SizeValue): this {
    this._def.maxBytes = parseSize(size);
    return this;
  }

  min(size: SizeValue): this {
    this._def.minBytes = parseSize(size);
    return this;
  }

  multiple(count?: number): UploadBuilder<TAuth, TMeta, true, TKind, TOutputNames> {
    this._def.multiple = true;
    if (count !== undefined) this._def.multipleLimit = count;
    return this as unknown as UploadBuilder<TAuth, TMeta, true, TKind, TOutputNames, TAsync>;
  }

  auth<TUser>(handler: Middleware<TUser>): UploadBuilder<TUser, TMeta, TMultiple, TKind, TOutputNames, TAsync> {
    this._def.auth = handler as Middleware<unknown>;
    this._def.overrideAuth = false;
    return this as unknown as UploadBuilder<TUser, TMeta, TMultiple, TKind, TOutputNames, TAsync>;
  }

  overrideAuth(): this {
    this._def.overrideAuth = true;
    delete this._def.auth;
    return this;
  }

  key(handler: (ctx: KeyContext<TAuth, TMeta>) => string | Promise<string>): this {
    this._def.key = handler as (ctx: KeyContext<unknown, unknown>) => string | Promise<string>;
    return this;
  }

  meta<TNextMeta>(
    handler: (ctx: {
      req: Request;
      file: UploadInputFile;
      user: TAuth;
    }) => TNextMeta | Promise<TNextMeta>
  ): UploadBuilder<TAuth, TNextMeta, TMultiple, TKind, TOutputNames, TAsync> {
    this._def.meta = handler as (ctx: {
      req: Request;
      file: UploadInputFile;
      user: unknown;
    }) => unknown | Promise<unknown>;
    return this as unknown as UploadBuilder<TAuth, TNextMeta, TMultiple, TKind, TOutputNames, TAsync>;
  }

  validate(
    handler: (ctx: {
      req: Request;
      file: UploadInputFile;
      user: TAuth;
      meta: TMeta;
    }) => true | string | Promise<true | string>
  ): this {
    this._def.validate = handler as (ctx: {
      req: Request;
      file: UploadInputFile;
      user: unknown;
      meta: unknown;
    }) => true | string | Promise<true | string>;
    return this;
  }

  preflight(handler: (ctx: PreflightContext<TAuth>) => true | string | Promise<true | string>): this {
    this._def.preflight = handler as (ctx: PreflightContext<unknown>) => true | string | Promise<true | string>;
    return this;
  }

  headers(headers: StorageHeadersConfig<TAuth, TMeta>): this {
    this._def.storageHeaders = headers as StorageHeadersConfig<unknown, unknown>;
    return this;
  }

  done(handler: (ctx: DoneContext<TAuth, TMeta, TMultiple>) => void | Promise<void>): this {
    this._def.done = handler as (ctx: DoneContext<unknown, unknown, boolean>) => void | Promise<void>;
    return this;
  }

  listeners(listeners: AsyncTransformListeners<TAuth, TMeta, TOutputNames>): this {
    this._def.listeners = listeners as AsyncTransformListeners;
    return this;
  }

  types(types: string[]): this {
    this._def.extensions = types.map((type) => type.toLowerCase());
    return this;
  }

  dimensions(rule: DimensionRule): this {
    this._def.dimensionRule = rule;
    return this;
  }

  square(): this {
    this._def.requireSquare = true;
    return this;
  }

  aspectRatio(value: `${number}:${number}`): this {
    this._def.aspectRatio = value;
    return this;
  }

  encoding(value: TextEncoding): this {
    this._def.encoding = value;
    return this;
  }

  schema<TSchema extends StandardSchema>(schema: TSchema): this {
    this._def.schema = schema;
    return this;
  }

  columns(headers: string[], options?: { delimiter?: "," | ";" | "\t" | "|" }): this {
    this._def.csvColumns = headers;
    if (options?.delimiter) this._def.delimiter = options.delimiter;
    return this;
  }

  delimiter(value: "," | ";" | "\t" | "|"): this {
    this._def.delimiter = value;
    return this;
  }

  pages(rule: PageRule): this {
    this._def.pageRule = rule;
    return this;
  }

  encrypted(value: boolean): this {
    this._def.encrypted = value;
    return this;
  }

  duration(rule: DurationRule): this {
    this._def.durationRule = rule;
    return this;
  }

  transform(...transforms: Array<CompatibleTransform<TKind>>): this {
    this._def.transforms = [...(this._def.transforms ?? []), ...transforms];
    return this;
  }

  transformAsync(
    ...transformsAndOptions: Array<CompatibleTransform<TKind> | AsyncTransformRouteOptions>
  ): UploadBuilder<TAuth, TMeta, TMultiple, TKind, TOutputNames, true> {
    const values = [...transformsAndOptions];
    const last = values.at(-1);
    const options = isAsyncTransformRouteOptions(last) ? last : undefined;
    const transforms = (options ? values.slice(0, -1) : values) as Array<CompatibleTransform<TKind>>;
    for (const transform of transforms) assertUploadTransform(transform);
    this._def.asyncTransforms = [...(this._def.asyncTransforms ?? []), ...transforms];
    if (options) this._def.asyncTransformOptions = options;
    return this as unknown as UploadBuilder<TAuth, TMeta, TMultiple, TKind, TOutputNames, true>;
  }

  outputs<const TName extends string>(
    ...outputs: Array<CompatibleOutput<TKind, TName>>
  ): UploadBuilder<TAuth, TMeta, TMultiple, TKind, TOutputNames | TName, TAsync> {
    this._def.outputs = [...(this._def.outputs ?? []), ...(outputs as UploadOutput[])];
    return this as unknown as UploadBuilder<TAuth, TMeta, TMultiple, TKind, TOutputNames | TName, TAsync>;
  }
}

function isAsyncTransformRouteOptions(value: unknown): value is AsyncTransformRouteOptions {
  if (!value || typeof value !== "object") return false;
  const keys = Object.keys(value);
  return keys.length === 0 || keys.every((key) => key === "timeout");
}

function assertUploadTransform(value: unknown): void {
  if (typeof value === "function") return;
  if (
    typeof value === "object" &&
    value !== null &&
    "transform" in value &&
    typeof (value as { transform?: unknown }).transform === "function"
  ) {
    return;
  }
  throw new TypeError(".transformAsync(...) expects transform functions or transform objects before the route options object.");
}

export function any(): AnyUploadBuilder {
  return new UploadBuilder("any") as unknown as AnyUploadBuilder;
}

export function image(): ImageUploadBuilder {
  return new UploadBuilder("image", ["image/"], [
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "avif"
  ]) as unknown as ImageUploadBuilder;
}

export function pdf(): PdfUploadBuilder {
  return new UploadBuilder("pdf", ["application/pdf"], ["pdf"]) as unknown as PdfUploadBuilder;
}

export function video(): VideoUploadBuilder {
  return new UploadBuilder("video", ["video/"], [
    "mp4",
    "webm",
    "mov",
    "avi",
    "mkv"
  ]) as unknown as VideoUploadBuilder;
}

export function audio(): AudioUploadBuilder {
  return new UploadBuilder("audio", ["audio/"], [
    "mp3",
    "wav",
    "ogg",
    "m4a",
    "aac",
    "flac"
  ]) as unknown as AudioUploadBuilder;
}

export function text(): TextUploadBuilder {
  return new UploadBuilder("text", ["text/"], ["txt", "md", "log"]) as unknown as TextUploadBuilder;
}

export function json(): JsonUploadBuilder {
  return new UploadBuilder("json", ["application/json"], ["json"]) as unknown as JsonUploadBuilder;
}

export function csv(): CsvUploadBuilder {
  return new UploadBuilder("csv", ["text/csv"], ["csv"]) as unknown as CsvUploadBuilder;
}

export function custom(type: string | string[]): CustomUploadBuilder {
  const mimeTypes = Array.isArray(type) ? type : [type];
  return new UploadBuilder("custom", mimeTypes) as unknown as CustomUploadBuilder;
}
