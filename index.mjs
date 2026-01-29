import { createServer } from "node:http";

const server = createServer((req, res) => {
  if (process.env.DEBUG_REQUESTS === "1") {
    console.log("request", { method: req.method, url: req.url ?? "/" });
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  console.log(`Received request for ${pathname}`);

  res.end("Hello World!\n");
});

server.listen(3000, "0.0.0.0", () => {
  console.log("Listening on 0.0.0.0:3000");
});
