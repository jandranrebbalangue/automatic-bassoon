import { createServer } from "node:http";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const MAX_BODY_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const RESPONSE_TIMEOUT_MS = 10_000;
const DEMO_PASSWORD_HASH = "$2b$10$aS8QSU5vNDxVb3evy75RMekzrTz8G5IHBxge8lcVfH0F7EDVyNEaG";
const USERS = new Map();

function isDemoUserEnabled() {
  return process.env.NODE_ENV !== "production";
}

function seedDemoUser() {
  if (!isDemoUserEnabled()) {
    return;
  }
  USERS.set("demo", { username: "demo", passwordHash: DEMO_PASSWORD_HASH });
}

seedDemoUser();

class HttpError extends Error {
  constructor(status, body, message) {
    super(message ?? body?.error ?? "Request failed");
    this.status = status;
    this.body = body;
  }
}

class RequestAbortedError extends Error {
  constructor() {
    super("Request aborted");
    this.code = "ERR_REQUEST_ABORTED";
  }
}

function isStrongPassword(password) {
  return (
    password.length >= 8 &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) {
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function sendJsonAndClose(req, res, status, body) {
  if (res.writableFinished) {
    req.socket.destroy();
    return;
  }
  if (res.writableEnded) {
    res.once("finish", () => {
      req.socket.destroy();
    });
    return;
  }
  if (res.headersSent) {
    req.socket.destroy();
    return;
  }
  res.once("finish", () => {
    req.socket.destroy();
  });
  if (!res.headersSent && !res.writableEnded) {
    sendJson(res, status, body, { Connection: "close" });
  }
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
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
    };

    const onData = (chunk) => {
      if (aborted) {
        return;
      }

      size += chunk.length;
      if (size > maxBytes) {
        aborted = true;
        req.pause();
        cleanup();
        reject(
          new HttpError(413, { ok: false, error: "Payload too large" }, "Payload too large")
        );
        return;
      }
      body += chunk.toString("utf8");
    };

    const onEnd = () => {
      if (aborted) {
        return;
      }
      cleanup();
      resolve(body);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onAborted = () => {
      aborted = true;
      cleanup();
      reject(new RequestAbortedError());
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
  });
}

async function readJson(req, options) {
  const body = await readBody(req, options);
  if (!body || !body.trim()) {
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
    const username = typeof parsed?.username === "string" ? parsed.username.trim() : undefined;
    const password = parsed?.password;
    if (!username || typeof password !== "string" || !password.trim()) {
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
    const token = jwt.sign({}, jwtSecret, { subject: username, expiresIn: "1h" });
    sendJson(res, 200, { ok: true, token }, { "Cache-Control": "no-store" });
    return;
  }

  if (method === "POST" && path === "/signup") {
    if (!isJsonRequest(req)) {
      sendJson(res, 415, { ok: false, error: "Expected application/json" });
      return;
    }
    const parsed = await readJson(req);
    const username = typeof parsed?.username === "string" ? parsed.username.trim() : undefined;
    const password = parsed?.password;
    if (!username || typeof password !== "string" || !password.trim()) {
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
    const token = jwt.sign({}, jwtSecret, { subject: username, expiresIn: "1h" });
    sendJson(res, 201, { ok: true, token }, { "Cache-Control": "no-store" });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Not Found" });
}

export function resetUsersForTest() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("resetUsersForTest is only available in test mode");
  }
  USERS.clear();
  seedDemoUser();
}

export function createAppServer() {
  const server = createServer((req, res) => {
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      sendJsonAndClose(req, res, 408, { ok: false, error: "Request timeout" });
    });

    res.setTimeout(RESPONSE_TIMEOUT_MS, () => {
      sendJsonAndClose(req, res, 503, { ok: false, error: "Response timeout" });
    });

    res.once("finish", () => {
      req.setTimeout(0);
      res.setTimeout(0);
    });

    handleRequest(req, res).catch((error) => {
      if (res.headersSent || res.writableEnded) {
        req.socket.destroy();
        return;
      }

      if (error?.code === "ERR_REQUEST_ABORTED") {
        return;
      }

      if (error instanceof HttpError) {
        if (error.status === 413) {
          sendJsonAndClose(
            req,
            res,
            error.status,
            error.body ?? { ok: false, error: "Request failed" }
          );
          return;
        }
        sendJson(res, error.status, error.body ?? { ok: false, error: "Request failed" });
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
