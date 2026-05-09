import {
  type DoneContext,
  type DurationValue,
  type KeyContext,
  type Middleware,
  type SizeValue,
  type StandardSchema,
  type UploadInputFile,
  type UploadKind,
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

export class UploadBuilder<
  TAuth = any,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TKind extends UploadKind = UploadKind
> {
  readonly __auth?: TAuth;
  readonly __meta?: TMeta;
  readonly __multiple?: TMultiple;
  readonly __kind?: TKind;
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

  multiple(count?: number): UploadBuilder<TAuth, TMeta, true, TKind> {
    this._def.multiple = true;
    if (count !== undefined) this._def.multipleLimit = count;
    return this as unknown as UploadBuilder<TAuth, TMeta, true, TKind>;
  }

  auth<TUser>(handler: Middleware<TUser>): UploadBuilder<TUser, TMeta, TMultiple, TKind> {
    this._def.auth = handler as Middleware<unknown>;
    this._def.overrideAuth = false;
    return this as unknown as UploadBuilder<TUser, TMeta, TMultiple, TKind>;
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
  ): UploadBuilder<TAuth, TNextMeta, TMultiple, TKind> {
    this._def.meta = handler as (ctx: {
      req: Request;
      file: UploadInputFile;
      user: unknown;
    }) => unknown | Promise<unknown>;
    return this as unknown as UploadBuilder<TAuth, TNextMeta, TMultiple, TKind>;
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

  done(handler: (ctx: DoneContext<TAuth, TMeta, TMultiple>) => void | Promise<void>): this {
    this._def.done = handler as (ctx: DoneContext<unknown, unknown, boolean>) => void | Promise<void>;
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

  headers(headers: string[]): this {
    this._def.headers = headers;
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
}

export function any(): UploadBuilder<any, unknown, false, "any"> {
  return new UploadBuilder("any");
}

export function image(): UploadBuilder<any, unknown, false, "image"> {
  return new UploadBuilder("image", ["image/"], ["png", "jpg", "jpeg", "webp", "gif", "avif"]);
}

export function pdf(): UploadBuilder<any, unknown, false, "pdf"> {
  return new UploadBuilder("pdf", ["application/pdf"], ["pdf"]);
}

export function video(): UploadBuilder<any, unknown, false, "video"> {
  return new UploadBuilder("video", ["video/"], ["mp4", "webm", "mov", "avi", "mkv"]);
}

export function audio(): UploadBuilder<any, unknown, false, "audio"> {
  return new UploadBuilder("audio", ["audio/"], ["mp3", "wav", "ogg", "m4a", "aac", "flac"]);
}

export function text(): UploadBuilder<any, unknown, false, "text"> {
  return new UploadBuilder("text", ["text/"], ["txt", "md", "log"]);
}

export function json(): UploadBuilder<any, unknown, false, "json"> {
  return new UploadBuilder("json", ["application/json"], ["json"]);
}

export function csv(): UploadBuilder<any, unknown, false, "csv"> {
  return new UploadBuilder("csv", ["text/csv"], ["csv"]);
}

export function custom(type: string | string[]): UploadBuilder<any, unknown, false, "custom"> {
  const mimeTypes = Array.isArray(type) ? type : [type];
  return new UploadBuilder("custom", mimeTypes);
}
