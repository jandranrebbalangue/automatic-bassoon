import { afterAll, beforeAll, expect, test } from "vitest";
import { createAppServer } from "./server.mjs";

let server;
let baseUrl;

beforeAll(async () => {
	server = createAppServer();
	await new Promise((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	await new Promise((resolve) => {
		server.close(resolve);
	});
});

test("GET /health returns ok", async () => {
	const response = await fetch(`${baseUrl}/health`);
	expect(response.status).toBe(200);
	const body = await response.json();
	expect(body).toEqual({ status: "ok" });
});

test("POST /echo returns payload", async () => {
	const payload = { message: "hello" };
	const response = await fetch(`${baseUrl}/echo`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	expect(response.status).toBe(200);
	const body = await response.json();
	expect(body).toEqual({ ok: true, data: payload });
});
