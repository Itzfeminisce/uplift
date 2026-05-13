# @uplift-io/image

Optional Sharp-backed image transforms and derived variants for Uplift routes.

```ts
import { image } from "@uplift-io/uplift";
import { resize, convert, compress, strip, variant } from "@uplift-io/image";

export const avatar = image()
  .transform(resize({ width: 512, height: 512, fit: "cover" }), convert("webp"), compress({ quality: 82 }), strip())
  .outputs(variant("thumb", resize({ width: 96, height: 96 }), convert("webp")));
```

Transforms run on the server before storage. Variants derive from the transformed primary file and are returned as typed outputs.

This package owns the Sharp dependency so `@uplift-io/uplift` core stays media-runtime free. `resize`, `convert`, `compress`, and `strip` produce real image bytes and update the uploaded file name, MIME type, size, and extension as appropriate.
