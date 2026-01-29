import { createServer } from "node:http";

const server = createServer((req, res) => {
 if (process.env.DEBUG_REQUESTS === "1") {
	const path = (req.url ?? "/").split("?", 1)[0];
	console.log("request", { method: req.method, path });
}

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello World!\n");
});

server.listen(3000, "0.0.0.0", () => {
  console.log("Listening on 0.0.0.0:3000");
});
