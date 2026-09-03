import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 8642);
const host = process.env.HOST || "127.0.0.1";
const types = {
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

createServer((request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || host}`);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let file = resolve(root, relative || "arena/editor.html");
    if (file !== root && !file.startsWith(root + sep)) throw new Error("outside root");
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    response.writeHead(200, { "Content-Type": types[extname(file).toLowerCase()] || "application/octet-stream" });
    createReadStream(file).on("error", () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
  }
}).listen(port, host, () => {
  console.log(`Orion Wars arena: http://${host}:${port}/arena/editor.html`);
});
