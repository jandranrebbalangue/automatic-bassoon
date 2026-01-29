import { createServer } from "node:http";

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (process.env.DEBUG_REQUESTS === "1") {
    let path = req.url ?? "/";
    try {
      path = new URL(path, "http://localhost").pathname;
    } catch {}
    console.log("request", { method: req.method, path });
  }
  res.writeHead(200, { "Content-Type": "text/plain" });

  res.end("Hello World!\n");
});

server.listen(3000, "0.0.0.0", () => {
  console.log("Listening on 0.0.0.0:3000");
});
