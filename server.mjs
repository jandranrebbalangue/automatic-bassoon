import { createServer } from "node:http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const MAX_BODY_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const RESPONSE_TIMEOUT_MS = 10_000;
const DEMO_PASSWORD_HASH = "$2b$10$2RBnPwfH7.sCWK7TAnpho.sgBZeNm42Z7OrPE/fDVPzbjUgR5gt8S";
const USERS = new Map([
  [
    "demo",
    {
      username: "demo",
      passwordHash: DEMO_PASSWORD_HASH,
    },
  ],
]);

class HttpError extends Error {
  constructor(status, body, message) {
    super(message ?? body?.error ?? "Request failed");
    this.status = status;
    this.body = body;
  }
}

function isStrongPassword(password) {
  return (
    password.length >= 8 &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function isJsonRequest(req) {
  const contentType = req.headers["content-type"] ?? "";
  const type = contentType.split(";", 1)[0].trim().toLowerCase();
  return type === "application/json" || type.endsWith("+json");
}

function readBody(req, { maxBytes = MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) {
        return;
      }

      size += chunk.length;
      if (size > maxBytes) {
        aborted = true;
        req.pause();
        reject(
          new HttpError(413, { ok: false, error: "Payload too large" }, "Payload too large")
        );
        return;
      }
      body += chunk.toString("utf8");
    });

    req.on("end", () => {
      if (aborted) {
        return;
      }
      resolve(body);
    });

    req.on("error", (error) => {
      reject(error);
    });
  });
}

async function readJson(req, options) {
  const body = await readBody(req, options);
  if (!body) {
    throw new HttpError(400, { ok: false, error: "Empty JSON body" }, "Empty JSON body");
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, { ok: false, error: "Invalid JSON" }, "Invalid JSON");
  }
}

export async function handleRequest(req, res) {
  const method = req.method ?? "GET";
  const rawUrl = req.url ?? "/";
  const path = rawUrl.split("?", 1)[0].replace(/[\r\n]/g, "");

  if (process.env.DEBUG_REQUESTS === "1") {
    console.log("request", { method: req.method ?? "UNKNOWN", path });
  }

  if (method === "GET" && path === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  if (method === "POST" && path === "/echo") {
    if (isJsonRequest(req)) {
      const payload = await readJson(req);
      sendJson(res, 200, { ok: true, data: payload });
      return;
    }

    const body = await readBody(req);
    sendJson(res, 200, { ok: true, data: body });
    return;
  }

  if (method === "POST" && path === "/login") {
    if (!isJsonRequest(req)) {
      sendJson(res, 415, { ok: false, error: "Expected application/json" });
      return;
    }
    const parsed = await readJson(req);
    const username = parsed?.username;
    const password = parsed?.password;
    if (typeof username !== "string" || typeof password !== "string") {
      sendJson(res, 400, { ok: false, error: "Invalid payload" });
      return;
    }

    const user = USERS.get(username);
    if (!user) {
      sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    const isValidUser = await bcrypt.compare(password, user.passwordHash);
    if (!isValidUser) {
      sendJson(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      sendJson(res, 500, { ok: false, error: "JWT_SECRET is required" });
      return;
    }
    const token = jwt.sign({ sub: username }, jwtSecret, { expiresIn: "1h" });
    sendJson(res, 200, { ok: true, token });
    return;
  }

  if (method === "POST" && path === "/signup") {
    if (!isJsonRequest(req)) {
      sendJson(res, 415, { ok: false, error: "Expected application/json" });
      return;
    }
    const parsed = await readJson(req);
    const username = parsed?.username;
    const password = parsed?.password;
    if (typeof username !== "string" || typeof password !== "string") {
      sendJson(res, 400, { ok: false, error: "Invalid payload" });
      return;
    }

    if (!isStrongPassword(password)) {
      sendJson(res, 400, {
        ok: false,
        error: "Password must be at least 8 characters and include a number and a special character",
      });
      return;
    }

    if (USERS.has(username)) {
      sendJson(res, 409, { ok: false, error: "User already exists" });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      sendJson(res, 500, { ok: false, error: "JWT_SECRET is required" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    USERS.set(username, { username, passwordHash });
    const token = jwt.sign({ sub: username }, jwtSecret, { expiresIn: "1h" });
    sendJson(res, 201, { ok: true, token });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not Found" });
}

export function resetUsersForTest() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetUsersForTest is only available in test mode");
  }
  USERS.clear();
  USERS.set("demo", { username: "demo", passwordHash: DEMO_PASSWORD_HASH });
}

export function createAppServer() {
  const server = createServer((req, res) => {
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      if (!res.headersSent && !res.writableEnded) {
        sendJson(res, 408, { ok: false, error: "Request timeout" });
        res.once("finish", () => {
          req.socket.destroy();
        });
      }
    });

    res.setTimeout(RESPONSE_TIMEOUT_MS, () => {
      if (!res.headersSent && !res.writableEnded) {
        sendJson(res, 503, { ok: false, error: "Response timeout" });
        res.once("finish", () => {
          req.socket.destroy();
        });
      }
    });

    handleRequest(req, res).catch((error) => {
      if (res.headersSent || res.writableEnded) {
        return;
      }

      if (error && typeof error === "object" && "status" in error) {
        sendJson(res, error.status, error.body ?? { ok: false, error: "Request failed" });
        if (error.status === 413) {
          res.on("finish", () => {
            req.socket.destroy();
          });
        }
        return;
      }

      if (process.env.DEBUG_REQUESTS === "1") {
        console.error("request:error", error);
      }

      sendJson(res, 500, { ok: false, error: "Internal Server Error" });
    });
  });

  return server;
}
