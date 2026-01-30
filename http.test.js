import jwt from "jsonwebtoken";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createAppServer } from "./server.mjs";

let server;
let baseUrl;
const TEST_JWT_SECRET = "test-secret";

beforeAll(async () => {
	process.env.JWT_SECRET = TEST_JWT_SECRET;
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

test("POST /login returns token", async () => {
	const response = await fetch(`${baseUrl}/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username: "demo", password: "password!1" }),
	});
	expect(response.status).toBe(200);
	const body = await response.json();
	expect(body.ok).toBe(true);
	expect(typeof body.token).toBe("string");
	const payload = jwt.verify(body.token, TEST_JWT_SECRET);
	expect(payload.sub).toBe("demo");
});

test("POST /login rejects invalid payload", async () => {
	const response = await fetch(`${baseUrl}/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username: "demo" }),
	});
	expect(response.status).toBe(400);
	const body = await response.json();
	expect(body).toEqual({ ok: false, error: "Invalid payload" });
});

test("POST /login rejects weak password", async () => {
	const response = await fetch(`${baseUrl}/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username: "demo", password: "weak" }),
	});
	expect(response.status).toBe(400);
	const body = await response.json();
	expect(body).toEqual({
		ok: false,
		error: "Password must be at least 8 characters and include a number and a special character",
	});
});

test("POST /login rejects wrong credentials", async () => {
	const response = await fetch(`${baseUrl}/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username: "demo", password: "wrongpass!1" }),
	});
	expect(response.status).toBe(401);
	const body = await response.json();
	expect(body).toEqual({ ok: false, error: "Unauthorized" });
});

test("POST /signup creates user and returns token", async () => {
	const response = await fetch(`${baseUrl}/signup`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username: "new-user", password: "secret!1" }),
	});
	expect(response.status).toBe(201);
	const body = await response.json();
	expect(body.ok).toBe(true);
	const payload = jwt.verify(body.token, TEST_JWT_SECRET);
	expect(payload.sub).toBe("new-user");
});

test("POST /signup rejects duplicate user", async () => {
	const response = await fetch(`${baseUrl}/signup`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username: "new-user", password: "secret!1" }),
	});
	expect(response.status).toBe(409);
	const body = await response.json();
	expect(body).toEqual({ ok: false, error: "User already exists" });
});

test("POST /signup rejects weak password", async () => {
	const response = await fetch(`${baseUrl}/signup`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username: "weak-user", password: "password" }),
	});
	expect(response.status).toBe(400);
	const body = await response.json();
	expect(body).toEqual({
		ok: false,
		error: "Password must be at least 8 characters and include a number and a special character",
	});
});
