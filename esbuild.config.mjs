import esbuild from "esbuild";
import builtinModules from "builtin-modules";

const production = process.argv[2] === "production";
await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", ...builtinModules],
  format: "cjs",
  target: "es2018",
  sourcemap: production ? false : "inline",
  minify: production,
  outfile: "main.js",
  treeShaking: true,
  logLevel: "info"
});
