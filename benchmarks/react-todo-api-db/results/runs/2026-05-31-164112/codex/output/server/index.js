import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { build } from "esbuild";

import { createApp } from "./app.js";
import { createTodoStore } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const dbPath = process.env.TODO_DB_PATH || path.join(projectRoot, "data", "todos.sqlite");

async function ensureClientBundle() {
  fs.mkdirSync(path.join(publicDir, "assets"), { recursive: true });
  await build({
    entryPoints: [path.join(projectRoot, "src", "main.jsx")],
    bundle: true,
    outfile: path.join(publicDir, "assets", "app.js"),
    format: "esm",
    jsx: "automatic",
    loader: {
      ".js": "jsx"
    }
  });
}

await ensureClientBundle();

const store = createTodoStore({ dbPath });
const apiApp = createApp({ store });
const app = express();
const indexPath = path.join(projectRoot, "index.html");

app.use(apiApp);
app.use("/assets", express.static(path.join(publicDir, "assets")));
app.get("*", (_req, res) => {
  res.sendFile(indexPath);
});

const port = Number.parseInt(process.env.PORT || "3000", 10);
const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
