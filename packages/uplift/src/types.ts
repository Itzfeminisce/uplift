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
  | "ABORTED"
  | "UNKNOWN_ROUTE"
  | "METHOD_NOT_ALLOWED"
  | "INVALID_REQUEST"
  | "TOO_MANY_FILES"
  | "UNSAFE_STORAGE_KEY"
  | "PREFLIGHT_FAILED"
  | "TRANSFORM_FAILED"
  | "OUTPUT_FAILED"
  | "STORAGE_FAILED"
  | "FILE_TOO_LARGE"
  | "FILE_TOO_SMALL"
  | "INVALID_TYPE"
  | "AUTH_FAILED"
  | "VALIDATION_FAILED"
  | "UPLOAD_FAILED"
  | "UNKNOWN";

export type RouteManifestRoute = {
  kind: UploadKind;
  multiple: boolean;
  multipleLimit?: number;
  maxBytes?: number;
  minBytes?: number;
  mimeTypes?: string[];
  extensions?: string[];
  outputs?: string[];
};

export type RouteManifest = {
  routes: Record<string, RouteManifestRoute>;
};

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

export type StorageHeaders = Record<string, string>;

export type StorageHeadersContext<TAuth = unknown, TMeta = unknown> = {
  req: Request;
  file: UploadInputFile;
  user: TAuth;
  meta: TMeta;
};

export type StorageHeadersConfig<TAuth = unknown, TMeta = unknown> =
  | StorageHeaders
  | ((ctx: StorageHeadersContext<TAuth, TMeta>) => StorageHeaders | Promise<StorageHeaders>);

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
  headers?: StorageHeaders;
};

export type StorageAdapter = {
  provider: string;
  put(input: StoragePutInput): Promise<UploadedFile>;
  delete?(key: string): Promise<void>;
};

export type Middleware<TUser = unknown> = (ctx: { req: Request }) => TUser | Promise<TUser>;

export type PreflightContext<TAuth = unknown> = {
  req: Request;
  file: UploadInputFile;
  user: TAuth;
};

export type PreflightResult =
  | { ok: true }
  | { ok: false; error: { code: UploadErrorCode; message: string } };

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
  preflight?: (ctx: PreflightContext<unknown>) => true | string | Promise<true | string>;
  done?: (ctx: DoneContext<unknown, unknown, boolean>) => void | Promise<void>;
  extensions?: string[];
  mimeTypes?: string[];
  dimensionRule?: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number };
  requireSquare?: boolean;
  aspectRatio?: `${number}:${number}`;
  encoding?: "utf-8" | "utf-16" | "ascii";
  schema?: StandardSchema;
  storageHeaders?: StorageHeadersConfig<unknown, unknown>;
  csvColumns?: string[];
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

export type UploadRouteClientMethod<TRoute> = ((
  input: ClientInput<TRoute>
) => Promise<ClientOutput<TRoute>>) & {
  abort(): void;
  retry(): Promise<ClientOutput<TRoute>>;
  preflight(input: ClientInput<TRoute>): Promise<
    | ({ ok: true; upload(): Promise<ClientOutput<TRoute>> })
    | { ok: false; error: { code: UploadErrorCode; message: string } }
  >;
};

export type UploadClient<TApp extends UpliftApp> = {
  [TRouteName in keyof TApp["routes"] & string]: UploadRouteClientMethod<TApp["routes"][TRouteName]>;
};
