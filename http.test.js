import jwt from "jsonwebtoken";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createAppServer } from "./server.mjs";

let server;
let baseUrl;
const TEST_JWT_SECRET = "test-secret";
let previousJwtSecret;

beforeAll(async () => {
  previousJwtSecret = process.env.JWT_SECRET;
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
  if (previousJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = previousJwtSecret;
  }
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

test("POST /echo rejects invalid JSON", async () => {
  const response = await fetch(`${baseUrl}/echo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not-json}",
  });
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body).toEqual({ ok: false, error: "Invalid JSON" });
});

test("POST /echo rejects oversized payload", async () => {
  const payload = "x".repeat(1024 * 1024 + 1);
  const response = await fetch(`${baseUrl}/echo`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: payload,
  });
  expect(response.status).toBe(413);
  const body = await response.json();
  expect(body).toEqual({ ok: false, error: "Payload too large" });
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
    body: JSON.stringify({ username: "new-user-1", password: "secret!1" }),
  });
  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body.ok).toBe(true);
  const payload = jwt.verify(body.token, TEST_JWT_SECRET);
  expect(payload.sub).toBe("new-user-1");
});

test("POST /signup rejects duplicate user", async () => {
  const username = "duplicate-user";
  const firstResponse = await fetch(`${baseUrl}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "secret!1" }),
  });
  expect(firstResponse.status).toBe(201);

  const response = await fetch(`${baseUrl}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "secret!1" }),
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

test("GET /missing returns 404", async () => {
  const response = await fetch(`${baseUrl}/missing`);
  expect(response.status).toBe(404);
  const body = await response.json();
  expect(body).toEqual({ ok: false, error: "Not Found" });
});
