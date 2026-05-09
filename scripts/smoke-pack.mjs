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

run(`pnpm pack --pack-destination "${tarballs}"`, path.join(root, "packages", "uplift"));

const tarball = (await readdir(tarballs)).find((file) => file.endsWith(".tgz"));
if (!tarball) throw new Error("pnpm pack did not produce a tarball.");

writeFileSync(path.join(tmp, "package.json"), JSON.stringify({
  name: "@uplift/package-smoke",
  private: true,
  type: "module",
  dependencies: {
    uplift: `file:${path.join(tarballs, tarball).replaceAll("\\", "/")}`
  },
  devDependencies: {
    typescript: "^5.7.3"
  }
}, null, 2));

writeFileSync(path.join(tmp, "index.mts"), `
import { createUploadClient, image, uplift } from "uplift";
import { uploadthing } from "uplift/storage/uploadthing";

const app = uplift({
  storage: uploadthing({
    uploader: async () => ({ url: "https://utfs.io/f/demo", key: "demo" })
  }),
  routes: {
    avatar: image().max("2mb")
  }
});

const client = createUploadClient<typeof app>("/api/upload");
client.avatar satisfies (file: File) => Promise<unknown>;
`);

writeFileSync(path.join(tmp, "tsconfig.json"), JSON.stringify({
  extends: "../../tsconfig.base.json",
  compilerOptions: {
    module: "NodeNext",
    moduleResolution: "NodeNext",
    noEmit: true
  },
  include: ["index.mts"]
}, null, 2));

run("npm install --ignore-scripts", tmp);
run("npx tsc -p tsconfig.json", tmp);

console.log("Package smoke install passed.");
