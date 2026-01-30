import { createServer } from "node:http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const USERS = new Map([
	[
		"demo",
		{
			username: "demo",
			passwordHash: bcrypt.hashSync("password!1", 10),
		},
	],
]);

function isStrongPassword(password) {
	return (
		password.length >= 8 &&
		/\d/.test(password) &&
		/[^A-Za-z0-9]/.test(password)
	);
}

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
		});
		return;
	}

	if (method === "POST" && path === "/login") {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			let parsed = null;
			if (body) {
				try {
					parsed = JSON.parse(body);
				} catch {
					parsed = null;
				}
			}

			const username = parsed?.username;
			const password = parsed?.password;
			if (typeof username !== "string" || typeof password !== "string") {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: "Invalid payload" }));
				return;
			}

			if (!isStrongPassword(password)) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						ok: false,
						error: "Password must be at least 8 characters and include a number and a special character",
					})
				);
				return;
			}

			const user = USERS.get(username);
			if (!user) {
				res.writeHead(401, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
				return;
			}

			const isValidUser =
				username === user.username && bcrypt.compareSync(password, user.passwordHash);
			if (!isValidUser) {
				res.writeHead(401, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
				return;
			}

			const jwtSecret = process.env.JWT_SECRET ?? "dev-secret";
			const token = jwt.sign({ sub: username }, jwtSecret, { expiresIn: "1h" });
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true, token }));
		});
		return;
	}

	if (method === "POST" && path === "/signup") {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", () => {
			let parsed = null;
			if (body) {
				try {
					parsed = JSON.parse(body);
				} catch {
					parsed = null;
				}
			}

			const username = parsed?.username;
			const password = parsed?.password;
			if (typeof username !== "string" || typeof password !== "string") {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: "Invalid payload" }));
				return;
			}

			if (!isStrongPassword(password)) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({
						ok: false,
						error: "Password must be at least 8 characters and include a number and a special character",
					})
				);
				return;
			}

			if (USERS.has(username)) {
				res.writeHead(409, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ ok: false, error: "User already exists" }));
				return;
			}

			const passwordHash = bcrypt.hashSync(password, 10);
			USERS.set(username, { username, passwordHash });
			const jwtSecret = process.env.JWT_SECRET ?? "dev-secret";
			const token = jwt.sign({ sub: username }, jwtSecret, { expiresIn: "1h" });
			res.writeHead(201, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true, token }));
		});
		return;
	}

	res.writeHead(200, { "Content-Type": "text/plain" });
	res.end("Hello World!\n");
}

export function createAppServer() {
	return createServer(handleRequest);
}
