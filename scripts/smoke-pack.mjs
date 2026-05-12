import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const tmp = path.join(root, ".tmp", "package-smoke");
const tarballs = path.join(root, ".tmp", "package-tarballs");
function run(command, cwd) {
  execSync(command, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh"
  });
}

rmSync(tmp, { recursive: true, force: true });
rmSync(tarballs, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(tarballs, { recursive: true });

const packages = [
  "bunny",
  "cloudinary",
  "express",
  "hono",
  "local",
  "memory",
  "next",
  "r2",
  "rich",
  "s3",
  "uplift",
  "uploadthing"
];

for (const packageName of packages) {
  run(`pnpm pack --pack-destination "${tarballs}"`, path.join(root, "packages", packageName));
}

const packed = await readdir(tarballs);
const tarballFor = (packageName) => {
  const slug = packageName === "uplift" ? "uplift-io-uplift" : `uplift-io-${packageName}`;
  const tarball = packed.find((file) => file.startsWith(slug) && file.endsWith(".tgz"));
  if (!tarball) throw new Error(`pnpm pack did not produce a tarball for ${packageName}.`);
  return `file:${path.join(tarballs, tarball).replaceAll("\\", "/")}`;
};

writeFileSync(path.join(tmp, "package.json"), JSON.stringify({
  name: "@uplift/package-smoke",
  private: true,
  type: "module",
  dependencies: {
    "@uplift-io/uplift": tarballFor("uplift"),
    "@uplift-io/bunny": tarballFor("bunny"),
    "@uplift-io/cloudinary": tarballFor("cloudinary"),
    "@uplift-io/express": tarballFor("express"),
    "@uplift-io/hono": tarballFor("hono"),
    "@uplift-io/local": tarballFor("local"),
    "@uplift-io/memory": tarballFor("memory"),
    "@uplift-io/next": tarballFor("next"),
    "@uplift-io/r2": tarballFor("r2"),
    "@uplift-io/rich": tarballFor("rich"),
    "@uplift-io/s3": tarballFor("s3"),
    "@uplift-io/uploadthing": tarballFor("uploadthing")
  },
  devDependencies: {
    typescript: "^5.7.3"
  }
}, null, 2));

writeFileSync(path.join(tmp, "index.mts"), `
import { image, uplift } from "@uplift-io/uplift";
import { createUploadClient } from "@uplift-io/uplift/client";
import { bunny } from "@uplift-io/bunny";
import { cloudinary } from "@uplift-io/cloudinary";
import { createExpressHandler } from "@uplift-io/express";
import { createHonoHandler } from "@uplift-io/hono";
import { local } from "@uplift-io/local";
import { createNextHandler } from "@uplift-io/next";
import { createMemoryStorage } from "@uplift-io/memory";
import { audio, pdf, video } from "@uplift-io/rich";
import { r2 } from "@uplift-io/r2";
import { s3 } from "@uplift-io/s3";
import { uploadthing } from "@uplift-io/uploadthing";

const app = uplift({
  storage: createMemoryStorage(),
  routes: {
    avatar: image().max("2mb")
  }
});

const client = createUploadClient<typeof app>("/api/upload");
client.avatar satisfies (file: File) => Promise<unknown>;
createNextHandler(app);
createHonoHandler(app);
createExpressHandler(app);
bunny({ apiKey: "key", zone: "zone" });
cloudinary({ cloudName: "demo", uploadPreset: "unsigned" });
local("./uploads");
s3({ bucket: "bucket", region: "us-east-1", client: { send: async () => {} } });
r2({ bucket: "bucket", accountId: "account", client: { send: async () => {} } });
uploadthing({ uploader: async () => ({ url: "https://utfs.io/f/demo", key: "demo" }) });
audio();
pdf();
video();
`);

writeFileSync(path.join(tmp, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "ES2022",
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    noEmit: true
  },
  include: ["index.mts"]
}, null, 2));

run("npm install --ignore-scripts", tmp);
run("npx tsc -p tsconfig.json", tmp);

console.log("Package smoke install passed.");
