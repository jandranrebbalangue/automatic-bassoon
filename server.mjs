import { createServer } from "node:http";

export function handleRequest(req, res) {
	if (process.env.DEBUG_REQUESTS === "1") {
		const path = (req.url ?? "/").split("?", 1)[0].replace(/[\r\n]/g, "");
		console.log("request", { method: req.method ?? "UNKNOWN", path });
	}

	const method = req.method ?? "GET";
	const path = (req.url ?? "/").split("?", 1)[0].replace(/[\r\n]/g, "");

	if (method === "GET" && path === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok" }));
		return;
	}

	if (method === "POST" && path === "/echo") {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			let parsed = null;
			let isJson = false;
			if (body) {
				try {
					parsed = JSON.parse(body);
					isJson = true;
				} catch {
					parsed = body;
				}
			}

		if (isJson) {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true, data: parsed }));
			return;
		}

		res.writeHead(200, { "Content-Type": "text/plain" });
		res.end(String(parsed ?? ""));
		return;
	});
		return;
	}

	res.writeHead(200, { "Content-Type": "text/plain" });
	res.end("Hello World!\n");
}

export function createAppServer() {
	return createServer(handleRequest);
}
