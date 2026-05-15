export type SizeValue = `${number}b` | `${number}kb` | `${number}mb` | `${number}gb`;
export type DurationValue = `${number}s` | `${number}m` | `${number}h`;

export type UploadInputFile = {
  name: string;
  type: string;
  size: number;
  extension?: string;
  file?: File;
};

export type UploadedFile = {
  url: string;
  key: string;
  name: string;
  type: string;
  size: number;
  extension?: string | undefined;
  provider: string;
  outputs?: Record<string, UploadedFile> | undefined;
};

export type ClientUploadedFile<TOutputNames extends string = never> = UploadedFile & (
  [TOutputNames] extends [never]
    ? object
    : {
        output<TName extends TOutputNames>(name: TName): UploadedFile;
      }
);

export type UploadErrorCode =
  | "FILE_TOO_LARGE"
  | "FILE_TOO_SMALL"
  | "INVALID_TYPE"
  | "AUTH_FAILED"
  | "VALIDATION_FAILED"
  | "UPLOAD_FAILED"
  | "UNKNOWN";

export class UploadError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode, message: string) {
    super(message);
    this.name = "UploadError";
    this.code = code;
  }

  toJSON() {
    return {
      message: this.message,
      code: this.code
    };
  }
}

export type StandardSchema<T = unknown> = {
  parse(input: unknown): T;
};

export type KeyContext<TAuth = unknown, TMeta = unknown> = {
  req: Request;
  file: UploadInputFile;
  user: TAuth;
  meta: TMeta;
};

export type DoneContext<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false
> = TMultiple extends true
  ? { req: Request; files: UploadedFile[]; user: TAuth; meta: TMeta[] }
  : { req: Request; file: UploadedFile; user: TAuth; meta: TMeta };

export type StoragePutInput = {
  key: string;
  file: UploadInputFile;
  body: File;
};

export type StorageAdapter = {
  provider: string;
  put(input: StoragePutInput): Promise<UploadedFile>;
  delete?(key: string): Promise<void>;
};

export type Middleware<TUser = unknown> = (ctx: { req: Request }) => TUser | Promise<TUser>;

declare const uploadRouteConfig: unique symbol;

export type UploadRouteConfig<
  TAuth = unknown,
  TMeta = unknown,
  TMultiple extends boolean = false,
  TKind extends UploadKind = UploadKind,
  TOutputNames extends string = never
> = {
  readonly [uploadRouteConfig]?: {
    auth: TAuth;
    meta: TMeta;
    multiple: TMultiple;
    kind: TKind;
    outputs: TOutputNames;
  };
};

export type UploadKind =
  | "any"
  | "image"
  | "pdf"
  | "video"
  | "audio"
  | "text"
  | "json"
  | "csv"
  | "custom";

export type PreparedUploadFile = {
  file: UploadInputFile;
  body: File;
};

export type TransformContext = PreparedUploadFile;

export type UploadTransform<TKind extends UploadKind = UploadKind> = {
  readonly __kind?: TKind | undefined;
  transform(ctx: TransformContext): File | PreparedUploadFile | Promise<File | PreparedUploadFile>;
};

export type UploadTransformFunction<TKind extends UploadKind = UploadKind> = ((
  ctx: TransformContext
) => File | PreparedUploadFile | Promise<File | PreparedUploadFile>) & {
  readonly __kind?: TKind | undefined;
};

export type CompatibleTransform<TKind extends UploadKind> = TKind extends "any" | "custom"
  ? UploadTransform<UploadKind> | UploadTransformFunction<UploadKind>
  : UploadTransform<TKind> | UploadTransform<"any"> | UploadTransformFunction<TKind> | UploadTransformFunction<"any">;

export type OutputContext = PreparedUploadFile & {
  primary: UploadedFile;
};

export type UploadOutput<TKind extends UploadKind = UploadKind, TName extends string = string> = {
  readonly __kind?: TKind | undefined;
  name: TName;
  produce(ctx: OutputContext): File | PreparedUploadFile | Promise<File | PreparedUploadFile>;
};

export type CompatibleOutput<TKind extends UploadKind, TName extends string = string> = TKind extends "any" | "custom"
  ? UploadOutput<UploadKind, TName>
  : UploadOutput<TKind, TName> | UploadOutput<"any", TName>;

export type UploadRouteDefinition = {
  kind: UploadKind;
  maxBytes?: number;
  minBytes?: number;
  multiple: boolean;
  multipleLimit?: number;
  auth?: Middleware<unknown>;
  overrideAuth: boolean;
  key?: (ctx: KeyContext<unknown, unknown>) => string | Promise<string>;
  meta?: (ctx: { req: Request; file: UploadInputFile; user: unknown }) => unknown | Promise<unknown>;
  validate?: (ctx: {
    req: Request;
    file: UploadInputFile;
    user: unknown;
    meta: unknown;
  }) => true | string | Promise<true | string>;
  done?: (ctx: DoneContext<unknown, unknown, boolean>) => void | Promise<void>;
  extensions?: string[];
  mimeTypes?: string[];
  dimensionRule?: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number };
  requireSquare?: boolean;
  aspectRatio?: `${number}:${number}`;
  encoding?: "utf-8" | "utf-16" | "ascii";
  schema?: StandardSchema;
  headers?: string[];
  delimiter?: "," | ";" | "\t" | "|";
  pageRule?: { min?: number; max?: number };
  encrypted?: boolean;
  durationRule?: { min?: DurationValue; max?: DurationValue };
  transforms?: Array<UploadTransform | UploadTransformFunction>;
  outputs?: Array<UploadOutput>;
};

export type UploadRoutes = Record<string, UploadRouteConfig<unknown, unknown, boolean, UploadKind, string>>;
export type UploadRouteDefinitions<TRoutes extends UploadRoutes = UploadRoutes> = {
  [TRouteName in keyof TRoutes]: TRoutes[TRouteName] & { readonly _def: UploadRouteDefinition };
};

export type UpliftApp<TRoutes extends UploadRoutes = UploadRoutes> = {
  storage: StorageAdapter;
  routes: UploadRouteDefinitions<TRoutes>;
  middleware?: Middleware<unknown> | undefined;
  onUploadComplete?: ((ctx: {
    route: keyof TRoutes & string;
    result: UploadedFile | UploadedFile[];
    user: unknown;
  }) => void | Promise<void>) | undefined;
};

export type IsMultiple<TRoute> = TRoute extends UploadRouteConfig<unknown, unknown, infer TMultiple>
  ? TMultiple extends true
    ? true
    : false
  : false;

export type OutputNames<TRoute> = TRoute extends UploadRouteConfig<unknown, unknown, boolean, UploadKind, infer TOutputNames>
  ? TOutputNames extends string
    ? TOutputNames
    : never
  : never;

export type ClientInput<TRoute> = IsMultiple<TRoute> extends true ? File[] | FileList : File;
export type ClientOutput<TRoute> = IsMultiple<TRoute> extends true
  ? Array<ClientUploadedFile<OutputNames<TRoute>>>
  : ClientUploadedFile<OutputNames<TRoute>>;

export type UploadClient<TApp extends UpliftApp> = {
  [TRouteName in keyof TApp["routes"] & string]: (
    input: ClientInput<TApp["routes"][TRouteName]>
  ) => Promise<ClientOutput<TApp["routes"][TRouteName]>>;
};
