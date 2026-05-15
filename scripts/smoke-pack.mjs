import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const tmp = path.join(root, ".tmp", "package-smoke");
const tarballs = path.join(root, ".tmp", "package-tarballs");
const packSources = path.join(root, ".tmp", "package-pack-sources");
const workspaceVersions = new Map();
function run(command, cwd) {
  execSync(command, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh"
  });
}

rmSync(tmp, { recursive: true, force: true });
rmSync(tarballs, { recursive: true, force: true });
rmSync(packSources, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(tarballs, { recursive: true });
mkdirSync(packSources, { recursive: true });

const packages = [
  "bunny",
  "cloudinary",
  "elysia",
  "express",
  "fastify",
  "hono",
  "image",
  "local",
  "memory",
  "next",
  "nuxt",
  "openapi",
  "r2",
  "remix",
  "rich",
  "s3",
  "sveltekit",
  "tanstack-start",
  "uplift",
  "uploadthing",
  "video"
];

for (const packageName of packages) {
  const packageJson = JSON.parse(readFileSync(path.join(root, "packages", packageName, "package.json"), "utf8"));
  workspaceVersions.set(packageJson.name, packageJson.version);
}

for (const packageName of packages) {
  const source = preparePackSource(packageName);
  run(`npm pack --pack-destination "${tarballs}"`, source);
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
    "@uplift-io/elysia": tarballFor("elysia"),
    "@uplift-io/express": tarballFor("express"),
    "@uplift-io/fastify": tarballFor("fastify"),
    "@uplift-io/hono": tarballFor("hono"),
    "@uplift-io/image": tarballFor("image"),
    "@uplift-io/local": tarballFor("local"),
    "@uplift-io/memory": tarballFor("memory"),
    "@uplift-io/next": tarballFor("next"),
    "@uplift-io/nuxt": tarballFor("nuxt"),
    "@uplift-io/openapi": tarballFor("openapi"),
    "@uplift-io/r2": tarballFor("r2"),
    "@uplift-io/remix": tarballFor("remix"),
    "@uplift-io/rich": tarballFor("rich"),
    "@uplift-io/s3": tarballFor("s3"),
    "@uplift-io/sveltekit": tarballFor("sveltekit"),
    "@uplift-io/tanstack-start": tarballFor("tanstack-start"),
    "@uplift-io/uploadthing": tarballFor("uploadthing"),
    "@uplift-io/video": tarballFor("video")
  },
  devDependencies: {
    typescript: "^5.7.3"
  }
}, null, 2));

writeFileSync(path.join(tmp, "index.mts"), `
import { image, uplift, video } from "@uplift-io/uplift";
import { createUploadClient } from "@uplift-io/uplift/client";
import { bunny } from "@uplift-io/bunny";
import { cloudinary } from "@uplift-io/cloudinary";
import { createElysiaHandler, upliftElysia } from "@uplift-io/elysia";
import { createExpressHandler } from "@uplift-io/express";
import { createFastifyHandler, fastifyManifest, upliftFastify } from "@uplift-io/fastify";
import { createHonoHandler } from "@uplift-io/hono";
import { local } from "@uplift-io/local";
import { resize, variant } from "@uplift-io/image";
import { createNextHandler } from "@uplift-io/next";
import { createNuxtHandler } from "@uplift-io/nuxt";
import { createOpenApiDocument } from "@uplift-io/openapi";
import { createMemoryStorage } from "@uplift-io/memory";
import { createRemixHandler } from "@uplift-io/remix";
import { audio, pdf, video as richVideo } from "@uplift-io/rich";
import { r2 } from "@uplift-io/r2";
import { s3 } from "@uplift-io/s3";
import { createSvelteKitHandler } from "@uplift-io/sveltekit";
import { createTanStackStartHandler } from "@uplift-io/tanstack-start";
import { uploadthing } from "@uplift-io/uploadthing";
import { thumbnail, transcode, trim } from "@uplift-io/video";

const app = uplift({
  storage: createMemoryStorage(),
  routes: {
    avatar: image()
      .max("2mb")
      .transform(resize({ width: 128 }))
      .outputs(variant("thumb", resize({ width: 32 }))),
    clip: video()
      .transform(trim({ start: "00:00:01" }), transcode({ format: "mp4" }))
      .outputs(thumbnail("thumb", { at: "25%" }))
  }
});

const client = createUploadClient<typeof app>("/api/upload");
client.avatar satisfies (file: File) => Promise<unknown>;
client.clip satisfies (file: File) => Promise<unknown>;
createNextHandler(app);
createHonoHandler(app);
createExpressHandler(app);
createFastifyHandler(app);
upliftFastify(app);
fastifyManifest(app);
createElysiaHandler(app);
upliftElysia(app);
createSvelteKitHandler(app);
createRemixHandler(app);
createTanStackStartHandler(app);
createNuxtHandler(app);
createOpenApiDocument({ routes: {} });
bunny({ apiKey: "key", zone: "zone" });
cloudinary({ cloudName: "demo", uploadPreset: "unsigned" });
local("./uploads");
s3({ bucket: "bucket", region: "us-east-1", client: { send: async () => {} } });
r2({ bucket: "bucket", accountId: "account", client: { send: async () => {} } });
uploadthing({ uploader: async () => ({ url: "https://utfs.io/f/demo", key: "demo" }) });
audio();
pdf();
richVideo();
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

function preparePackSource(packageName) {
  const source = path.join(root, "packages", packageName);
  const target = path.join(packSources, packageName);
  const packageJson = JSON.parse(readFileSync(path.join(source, "package.json"), "utf8"));
  packageJson.dependencies = replaceWorkspaceDependencies(packageJson.dependencies);
  packageJson.peerDependencies = replaceWorkspaceDependencies(packageJson.peerDependencies);
  packageJson.optionalDependencies = replaceWorkspaceDependencies(packageJson.optionalDependencies);
  delete packageJson.scripts;

  mkdirSync(target, { recursive: true });
  writeFileSync(path.join(target, "package.json"), JSON.stringify(packageJson, null, 2));
  for (const file of packageJson.files ?? []) {
    const from = path.join(source, file);
    if (existsSync(from)) cpSync(from, path.join(target, file), { recursive: true });
  }
  for (const file of ["README.md", "LICENSE"]) {
    const from = path.join(source, file);
    if (existsSync(from)) cpSync(from, path.join(target, file), { recursive: true });
  }
  return target;
}

function replaceWorkspaceDependencies(dependencies) {
  if (!dependencies) return dependencies;
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, version]) => [
      name,
      typeof version === "string" && version.startsWith("workspace:") ? workspaceVersions.get(name) ?? version : version
    ])
  );
}
