import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

class TFolder {}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundled = buildSync({
  entryPoints: [path.join(root, "src/repository.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["obsidian"],
  write: false,
}).outputFiles[0].text;
const filename = path.join(root, "tests", ".repository-test-bundle.cjs");
const loaded = new Module(filename);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === "obsidian") return { TFolder };
  return originalLoad.call(this, request, parent, isMain);
};
try {
  loaded._compile(bundled, filename);
} finally {
  Module._load = originalLoad;
}
const { VaultRepository } = loaded.exports;

function repository({ cached = new Map(), disk = new Map(), create } = {}) {
  const app = {
    vault: {
      getAbstractFileByPath: folder => cached.get(folder),
      createFolder: async folder => {
        if (create) return create(folder, cached, disk);
        if (cached.has(folder) || disk.has(folder)) throw new Error("Folder already exists.");
        const item = new TFolder();
        cached.set(folder, item);
        disk.set(folder, { type: "folder" });
        return item;
      },
      adapter: { stat: async folder => disk.get(folder) ?? null },
    },
  };
  return new VaultRepository(app, {});
}

test("creates missing folder paths one segment at a time", async () => {
  const created = [];
  const repo = repository({ create: async (folder, cached, disk) => {
    created.push(folder);
    cached.set(folder, new TFolder());
    disk.set(folder, { type: "folder" });
  } });
  await repo.ensureFolder("Notes/Quick Notes");
  assert.deepEqual(created, ["Notes", "Notes/Quick Notes"]);
});

test("treats a concurrent duplicate folder creation as success", async () => {
  const repo = repository({ create: async (folder, cached, disk) => {
    const item = new TFolder();
    cached.set(folder, item);
    disk.set(folder, { type: "folder" });
    throw new Error("Folder already exists.");
  } });
  await assert.doesNotReject(repo.ensureFolder("Notes"));
});

test("confirms a raced folder through the adapter when the vault cache lags", async () => {
  const repo = repository({ create: async (folder, _cached, disk) => {
    disk.set(folder, { type: "folder" });
    throw new Error("Folder already exists.");
  } });
  await assert.doesNotReject(repo.ensureFolder("Projects"));
});

test("reports a blocking file with its exact path", async () => {
  const repo = repository({ cached: new Map([["Notes", { extension: "md" }]]) });
  await assert.rejects(repo.ensureFolder("Notes"), /file is blocking folder "Notes"/);
});

test("includes the exact path for genuine create failures", async () => {
  const repo = repository({ create: async () => { throw new Error("Permission denied."); } });
  await assert.rejects(repo.ensureFolder("Projects/2026"), /Could not create folder "Projects": Permission denied/);
});
