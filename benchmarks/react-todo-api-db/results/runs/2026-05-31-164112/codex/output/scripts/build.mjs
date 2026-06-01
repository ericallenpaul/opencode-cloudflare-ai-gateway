import { build } from "esbuild";

await build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  outfile: "public/assets/app.js",
  format: "esm",
  jsx: "automatic",
  loader: {
    ".js": "jsx"
  },
  sourcemap: false,
  minify: false
});
