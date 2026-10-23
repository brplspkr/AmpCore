/**
 * Phone remote gateway.
 *
 * The Next.js server only listens on 127.0.0.1. This small HTTP server listens
 * on the local network so phones and tablets can open the remote, and:
 *   - requires a 6-digit PIN (remembered in a cookie for 30 days),
 *   - only forwards the remote page, its assets and /api/remote/*,
 *   - rate-limits wrong PINs per client address.
 *
 * Settings live in <userData>/remote-access.json.
 */

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");

const DEFAULT_PORT = 8787;
const COOKIE_NAME = "ampcore_remote";
const COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

const ALLOWED_PREFIXES = ["/remote", "/api/remote/", "/_next/"];
const ALLOWED_EXACT = new Set(["/remote.webmanifest", "/logo.ico", "/favicon.ico"]);

function generatePin() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function loadConfig(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (/^\d{6}$/.test(raw.pin) && typeof raw.secret === "string" && raw.secret.length >= 32) {
      return {
        enabled: raw.enabled !== false,
        port: Number.isInteger(raw.port) ? raw.port : DEFAULT_PORT,
        pin: raw.pin,
        secret: raw.secret
      };
    }
  } catch {
    // Missing or unreadable: start fresh below.
  }
  return { enabled: true, port: DEFAULT_PORT, pin: generatePin(), secret: crypto.randomBytes(32).toString("hex") };
}

function getLanAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

function parseCookies(header) {
  const cookies = {};
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function loginPage(message) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#121212">
<title>AmpCore Remote</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #121212; color: #ececec;
         font: 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  form { width: min(320px, calc(100vw - 32px)); display: grid; gap: 14px; }
  h1 { margin: 0; font-size: 22px; }
  p { margin: 0; color: #a3a3a3; font-size: 14px; }
  input { font-size: 28px; letter-spacing: 8px; text-align: center; padding: 12px; border-radius: 8px;
          border: 1px solid #3a3a3a; background: #1c1c1c; color: inherit; }
  button { font-size: 17px; padding: 14px; border-radius: 8px; border: 0; background: #e8663d; color: #121212; font-weight: 600; }
  .error { color: #f87171; }
</style>
</head>
<body>
<form method="post" action="/remote-login">
  <h1>AmpCore Remote</h1>
  <p>Enter the PIN shown in the AmpCore desktop app under Phone Remote.</p>
  ${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}
  <input name="pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" autofocus required>
  <button type="submit">Connect</button>
</form>
</body>
</html>`;
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * @param {{ configFile: string, targetPort: number }} options
 */
function createRemoteGateway({ configFile, targetPort }) {
  let config = loadConfig(configFile);
  let server = null;
  let lastError = null;
  const failures = new Map(); // ip -> { count, until }

  const save = () => {
    try {
      fs.mkdirSync(path.dirname(configFile), { recursive: true });
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
    } catch (error) {
      console.error("[remote-gateway] Failed to save settings:", error);
    }
  };

  // Changing the PIN changes the token, which signs everyone out.
  const sessionToken = () => crypto.createHmac("sha256", config.secret).update(`pin:${config.pin}`).digest("hex");

  const isAuthorized = (req) => safeEqual(parseCookies(req.headers.cookie)[COOKIE_NAME] ?? "", sessionToken());

  const isAllowedPath = (pathname) =>
    ALLOWED_EXACT.has(pathname) ||
    ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));

  const sendHtml = (res, status, html) => {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(html);
  };

  const handleLogin = async (req, res) => {
    const ip = req.socket.remoteAddress ?? "unknown";
    const record = failures.get(ip);
    if (record && record.until > Date.now()) {
      sendHtml(res, 429, loginPage("Too many wrong PINs. Try again in a few minutes."));
      return;
    }

    let pin = "";
    try {
      pin = new URLSearchParams(await readBody(req)).get("pin")?.trim() ?? "";
    } catch {
      sendHtml(res, 400, loginPage("Something went wrong. Try again."));
      return;
    }

    if (!safeEqual(pin, config.pin)) {
      const count = (record?.count ?? 0) + 1;
      failures.set(ip, { count, until: count >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0 });
      sendHtml(res, 401, loginPage("Wrong PIN."));
      return;
    }

    failures.delete(ip);
    res.writeHead(303, {
      Location: "/remote",
      "Set-Cookie": `${COOKIE_NAME}=${sessionToken()}; Path=/; Max-Age=${COOKIE_MAX_AGE_S}; HttpOnly; SameSite=Lax`
    });
    res.end();
  };

  const proxy = (req, res) => {
    const headers = { ...req.headers, host: `127.0.0.1:${targetPort}` };
    delete headers.cookie; // The Next.js app has no use for the gateway session.
    // Present requests as same-origin; `next dev` blocks cross-origin dev resources otherwise.
    delete headers.origin;
    delete headers.referer;

    const upstream = http.request(
      { host: "127.0.0.1", port: targetPort, method: req.method, path: req.url, headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
      res.end("AmpCore is starting up. Try again in a moment.");
    });
    req.pipe(upstream);
  };

  const handler = (req, res) => {
    const pathname = new URL(req.url ?? "/", "http://gateway").pathname;

    if (pathname === "/remote-login") {
      if (req.method === "POST") {
        void handleLogin(req, res);
      } else {
        sendHtml(res, 200, loginPage(null));
      }
      return;
    }

    if (pathname === "/") {
      res.writeHead(302, { Location: "/remote" });
      res.end();
      return;
    }

    if (!isAllowedPath(pathname)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    if (!isAuthorized(req)) {
      if (pathname.startsWith("/api/")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "PIN required" }));
      } else {
        res.writeHead(302, { Location: "/remote-login" });
        res.end();
      }
      return;
    }

    proxy(req, res);
  };

  // Websockets are only used by `next dev` (hot reload); its client waits for one before hydrating.
  const handleUpgrade = (req, socket, head) => {
    const pathname = new URL(req.url ?? "/", "http://gateway").pathname;
    if (!pathname.startsWith("/_next/") || !isAuthorized(req)) {
      socket.destroy();
      return;
    }

    const upstream = net.connect(targetPort, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const name = req.rawHeaders[i].toLowerCase();
        if (name === "host" || name === "origin" || name === "cookie") continue;
        lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      lines.push(`Host: 127.0.0.1:${targetPort}`);
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head?.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  };

  const start = () => {
    if (server || !config.enabled) return;
    lastError = null;
    server = http.createServer(handler);
    server.on("upgrade", handleUpgrade);
    server.on("error", (error) => {
      lastError = error.code === "EADDRINUSE" ? `Port ${config.port} is already in use` : error.message;
      console.error("[remote-gateway]", lastError);
      server = null;
    });
    server.listen(config.port, "0.0.0.0");
  };

  const stop = () => {
    if (!server) return;
    server.close();
    server.closeAllConnections?.();
    server = null;
  };

  const getInfo = () => ({
    enabled: config.enabled,
    running: server !== null && server.listening,
    port: config.port,
    pin: config.pin,
    urls: getLanAddresses().map((address) => `http://${address}:${config.port}/remote`),
    error: lastError
  });

  save();

  return {
    start,
    stop,
    getInfo,
    setEnabled(enabled) {
      config = { ...config, enabled: Boolean(enabled) };
      save();
      if (config.enabled) start();
      else stop();
      return getInfo();
    },
    regeneratePin() {
      config = { ...config, pin: generatePin() };
      save();
      return getInfo();
    }
  };
}

module.exports = { createRemoteGateway };
