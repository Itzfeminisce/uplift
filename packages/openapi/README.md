# @uplift-io/openapi

Generate an OpenAPI 3.1 document from a public Uplift Route Manifest.

```ts
import { createRouteManifest } from "@uplift-io/uplift/server";
import { createOpenApiDocument } from "@uplift-io/openapi";

const manifest = createRouteManifest(uploads);
export const openapi = createOpenApiDocument(manifest, { path: "/api/upload" });
```
