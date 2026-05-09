import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/client.ts",
    "src/react.ts",
    "src/rich.ts",
    "src/next.ts",
    "src/hono.ts",
    "src/express.ts",
    "src/storage/s3.ts",
    "src/storage/r2.ts",
    "src/storage/bunny.ts",
    "src/storage/cloudinary.ts",
    "src/storage/local.ts",
    "src/storage/uploadthing.ts"
  ],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false
});
