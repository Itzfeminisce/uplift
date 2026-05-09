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
};

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
  ? { req: Request; files: UploadedFile[]; user: TAuth; meta: TMeta }
  : { req: Request; file: UploadedFile; user: TAuth; meta: TMeta };

export type StoragePutInput = {
  key: string;
  file: UploadInputFile;
  body: File;
};

export type StorageAdapter = {
  provider: string;
  put(input: StoragePutInput): Promise<UploadedFile>;
};

export type Middleware<TUser = unknown> = (ctx: { req: Request }) => TUser | Promise<TUser>;

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
};

export type UploadRoutes = Record<string, { _def: UploadRouteDefinition }>;

export type UpliftApp<TRoutes extends UploadRoutes = UploadRoutes> = {
  storage: StorageAdapter;
  routes: TRoutes;
  middleware?: Middleware<unknown> | undefined;
  onUploadComplete?: ((ctx: {
    route: keyof TRoutes & string;
    result: UploadedFile | UploadedFile[];
    user: unknown;
  }) => void | Promise<void>) | undefined;
};

export type IsMultiple<TRoute> = TRoute extends { __multiple?: infer TMultiple }
  ? TMultiple extends true
    ? true
    : false
  : false;

export type ClientInput<TRoute> = IsMultiple<TRoute> extends true ? File[] | FileList : File;
export type ClientOutput<TRoute> = IsMultiple<TRoute> extends true ? UploadedFile[] : UploadedFile;

export type UploadClient<TApp extends UpliftApp> = {
  [TRouteName in keyof TApp["routes"] & string]: (
    input: ClientInput<TApp["routes"][TRouteName]>
  ) => Promise<ClientOutput<TApp["routes"][TRouteName]>>;
};
