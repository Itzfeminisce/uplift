import type { RouteManifest } from "@uplift-io/uplift";

export type OpenApiDocument = {
  openapi: "3.1.0";
  info: { title: string; version: string };
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
};

export function createOpenApiDocument(manifest: RouteManifest, options: { title?: string; version?: string; path?: string } = {}): OpenApiDocument {
  const path = options.path ?? "/api/upload";
  return {
    openapi: "3.1.0",
    info: {
      title: options.title ?? "Uplift Upload API",
      version: options.version ?? "1.0.0"
    },
    paths: {
      [path]: {
        head: {
          summary: "Upload health check",
          responses: { "204": { description: "Upload endpoint is available" } }
        },
        get: {
          summary: "Route Manifest",
          responses: {
            "200": {
              description: "Public upload route manifest",
              content: { "application/json": { schema: { $ref: "#/components/schemas/RouteManifest" } } }
            }
          }
        },
        post: {
          summary: "Create an upload attempt",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  oneOf: [
                    { type: "object", properties: { file: { type: "string", format: "binary" } }, required: ["file"] },
                    { type: "object", properties: { files: { type: "array", items: { type: "string", format: "binary" } } }, required: ["files"] }
                  ]
                }
              }
            }
          },
          responses: {
            "200": {
              description: "Uploaded file result",
              content: { "application/json": { schema: { $ref: "#/components/schemas/UploadResponse" } } }
            },
            "400": { $ref: "#/components/responses/UploadError" },
            "401": { $ref: "#/components/responses/UploadError" },
            "500": { $ref: "#/components/responses/UploadError" }
          },
          "x-uplift-routes": manifest.routes
        }
      }
    },
    components: {
      schemas: {
        UploadedFile: uploadedFileSchema(),
        UploadResponse: {
          type: "object",
          properties: {
            result: {
              oneOf: [
                { $ref: "#/components/schemas/UploadedFile" },
                { type: "array", items: { $ref: "#/components/schemas/UploadedFile" } }
              ]
            }
          },
          required: ["result"]
        },
        UploadError: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" }
              },
              required: ["code", "message"]
            }
          },
          required: ["error"]
        },
        RouteManifest: {
          type: "object",
          properties: {
            routes: {
              type: "object",
              additionalProperties: { $ref: "#/components/schemas/RouteManifestRoute" }
            }
          },
          required: ["routes"]
        },
        RouteManifestRoute: {
          type: "object",
          properties: {
            kind: { type: "string" },
            multiple: { type: "boolean" },
            multipleLimit: { type: "number" },
            maxBytes: { type: "number" },
            minBytes: { type: "number" },
            mimeTypes: { type: "array", items: { type: "string" } },
            extensions: { type: "array", items: { type: "string" } },
            outputs: { type: "array", items: { type: "string" } }
          },
          required: ["kind", "multiple"]
        }
      },
      responses: {
        UploadError: {
          description: "Upload error",
          content: { "application/json": { schema: { $ref: "#/components/schemas/UploadError" } } }
        }
      } as never
    } as never
  };
}

function uploadedFileSchema() {
  return {
    type: "object",
    properties: {
      url: { type: "string" },
      key: { type: "string" },
      name: { type: "string" },
      type: { type: "string" },
      size: { type: "number" },
      extension: { type: "string" },
      provider: { type: "string" },
      outputs: { type: "object", additionalProperties: { $ref: "#/components/schemas/UploadedFile" } }
    },
    required: ["url", "key", "name", "type", "size", "provider"]
  };
}
