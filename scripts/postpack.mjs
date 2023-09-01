// Remove internal types from the tarball produced by npm pack before publishing.

import url from "url";
import path from "path";
import { spawnSync } from "child_process";
import fs from "fs";

const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const convexDir = path.join(__dirname, "..");

const tarball = getOnlyTarball(convexDir);

const tmpDir = path.join(
  convexDir,
  "tmpPackage" + ("" + Math.random()).slice(2, 8)
);
console.log("creating temp folder", tmpDir);
fs.rmSync(tmpDir, { force: true, recursive: true });
fs.mkdirSync(tmpDir);

run("tar", "xzf", tarball, "-C", tmpDir);
const tmpPackage = path.join(tmpDir, "package");

console.log("modifying package.json");
let packageJson = JSON.parse(
  fs.readFileSync(path.join(tmpPackage, "package.json"))
);
pointToPublic(packageJson.exports);
pointToPublic(packageJson.typesVersions);

console.log("Removing dev-only ts-node CLI script");
packageJson.bin["convex"] = packageJson.bin["convex-bundled"];
delete packageJson.bin["convex-bundled"];
delete packageJson.bin["//"];

fs.writeFileSync(
  path.join(tmpPackage, "package.json"),
  JSON.stringify(packageJson, null, 2) + "\n"
);

console.log("modifying stub directories");
const stubs = getStubDirectories(convexDir);
for (const [dirname, contents] of Object.entries(stubs)) {
  pointToPublic(contents);
  fs.writeFileSync(
    path.join(tmpPackage, dirname, "package.json"),
    JSON.stringify(contents, null, 2) + "\n"
  );
}

// Remove internal types
fs.rmSync(path.join(tmpPackage, "dist", "internal-cjs-types"), {
  recursive: true,
});
fs.rmSync(path.join(tmpPackage, "dist", "internal-esm-types"), {
  recursive: true,
});

run("tar", "czvf", tarball, "-C", tmpDir, "package");
fs.rmSync(tmpDir, { recursive: true });

function getOnlyTarball(dirname) {
  const files = fs.readdirSync(dirname);
  const tarballs = files.filter((f) => f.endsWith(".tgz"));
  if (tarballs.length < 1) throw new Error("No tarball found.");
  if (tarballs.length > 1) {
    throw new Error(
      "Multiple tarballs found, please `rm *.tgz` and run again. `--pack-destination` is not allowed."
    );
  }
  return path.join(dirname, tarballs[0]);
}

function pointToPublic(obj) {
  for (const key of Object.keys(obj)) {
    let value = obj[key];
    if (typeof value === "string") {
      value = value.replace("-internal", "").replace("internal-", "");
      obj[key] = value;
    }
    if (typeof value === "object") {
      pointToPublic(value);
    }
  }
}

function getStubDirectories(dirname) {
  return Object.fromEntries(
    fs
      .readdirSync(dirname)
      .filter((d) => fs.existsSync(path.join(dirname, d, "package.json")))
      .map((d) => [
        d,
        JSON.parse(
          fs.readFileSync(path.join(dirname, d, "package.json"), {
            encoding: "utf-8",
          })
        ),
      ])
  );
}

function run(...args) {
  console.log(args.join(" "));
  spawnSync(args[0], args.slice(1), { stdio: "inherit" });
}