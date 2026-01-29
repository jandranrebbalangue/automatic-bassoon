import { createServer } from "node:http";

const server = createServer((req, res) => {
  if (process.env.DEBUG_REQUESTS === "1") {
    const path = (req.url ?? "/").split("?", 1)[0].replace(/[\r\n]/g, "");
    console.log("request", { method: req.method ?? "UNKNOWN", path });
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello World!\n");
});

server.listen(3000, "0.0.0.0", () => {
  console.log("Listening on 0.0.0.0:3000");
});
