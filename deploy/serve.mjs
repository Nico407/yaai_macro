// Serves the built app (dist/) on the Pi: plain files, and index.html for app routes like /plan/cookbook.
// No dependencies. HOST and PORT come from the service (Tailscale address only).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "dist");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".json": "application/json", ".webp": "image/webp",
  ".woff2": "font/woff2", ".txt": "text/plain" };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, path);
  try {
    if (!(await stat(file)).isFile()) throw new Error("dir");
  } catch {
    file = join(root, "index.html");          // app route: the app's router takes it from here
  }
  try {
    const body = await readFile(file);
    const cache = file.includes(`${join(root, "assets")}`) ? "public, max-age=31536000, immutable" : "no-cache";
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": cache });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(Number(process.env.PORT ?? 5007), process.env.HOST ?? "127.0.0.1", () =>
  console.log(`YAAI Macros on http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? 5007}`));
