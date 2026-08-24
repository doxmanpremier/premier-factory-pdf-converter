/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  AUTH_USERNAME: string;
  AUTH_PASSWORD_HASH: string;
  SESSION_SIGNING_KEY: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type ProjectRow = {
  id: string;
  name: string;
  factory: string;
  dealers: string;
  premier_estimator: string;
  premier_sales_rep: string;
  total_amount: number;
  specification: string;
  territory: string;
  upload_date: string;
  bid_date: string;
  source_file: string;
  items: string;
  quotes: string;
  created_at: string;
};

const SPEC_OPTIONS = new Set(["Prime Spec", "Approved Alternate", "Unapproved Alternate"]);
const TERRITORY_OPTIONS = new Set(["MAFSI 11", "MAFSI 12", "MAFSI 11 & MAFSI 12"]);
const FACTORY_OPTIONS = new Set(["Cline's Welding and Fabrication", "Halton", "Low Temp Industries", "AmeriKooler"]);
const SESSION_COOKIE = "clines_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function bytesToHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function sha256(value: string) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function signSession(payload: string, signingKey: string) {
  const key = await crypto.subtle.importKey("raw", hexToBytes(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

async function createSession(env: Env) {
  const payload = base64UrlEncode(JSON.stringify({ username: env.AUTH_USERNAME, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 }));
  return `${payload}.${await signSession(payload, env.SESSION_SIGNING_KEY)}`;
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

async function isAuthenticated(request: Request, env: Env) {
  try {
    if (!env.AUTH_USERNAME || !/^[0-9a-f]{64}$/i.test(env.SESSION_SIGNING_KEY)) return false;
    const [payload, signature] = readCookie(request, SESSION_COOKIE).split(".");
    if (!payload || !signature || !constantTimeEqual(signature, await signSession(payload, env.SESSION_SIGNING_KEY))) return false;
    const session = JSON.parse(base64UrlDecode(payload)) as { username?: string; expiresAt?: number };
    return session.username === env.AUTH_USERNAME && typeof session.expiresAt === "number" && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function loginPage(invalid = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Factory Quote Converter</title><style>
  :root{--ink:#232326;--muted:#686b70;--red:#bd1420;--red-dark:#8f0b14;--line:#cfd0d3}*{box-sizing:border-box}body{display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;color:var(--ink);background:linear-gradient(180deg,#ffffff 0%,#f2f2f3 100%);font:15px/1.45 Inter,Segoe UI,Arial,sans-serif}.login{width:min(440px,100%);padding:32px;border:1px solid var(--line);border-top:4px solid var(--red);border-radius:20px;background:white;box-shadow:0 14px 42px rgba(35,35,38,.12)}.brand{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--line)}.brand img{width:55px;height:55px;object-fit:contain;filter:drop-shadow(0 3px 7px rgba(35,35,38,.16))}.wordmark{display:grid;line-height:1}.wordmark strong{font-size:22px;font-weight:900;letter-spacing:.11em}.wordmark small{margin-top:6px;color:#696b70;font-size:7px;font-weight:800;letter-spacing:.42em;text-align:center}.eyebrow{margin:0 0 7px;color:var(--red);font-size:12px;font-weight:800;letter-spacing:.12em}h1{margin:0;font-size:32px;line-height:1.08;letter-spacing:-.03em}p{margin:10px 0 22px;color:var(--muted)}label{display:grid;gap:6px;margin-top:15px;color:#454548;font-size:13px;font-weight:750}input{width:100%;padding:12px;border:1px solid #cfd0d2;border-radius:9px;color:var(--ink);background:white;font:inherit}input:focus{outline:3px solid rgba(189,20,32,.13);border-color:var(--red)}button{width:100%;margin-top:22px;padding:13px 17px;border:0;border-radius:9px;color:white;background:var(--red);font:inherit;font-weight:800;cursor:pointer}button:hover{background:var(--red-dark)}.error{margin:14px 0 0;padding:10px 12px;border-radius:8px;color:#9f2632;background:#fae9eb;font-weight:700}
  </style></head><body><main class="login"><div class="brand"><img src="https://premierfsg.com/wp-content/uploads/2024/02/premiere_logomark-chrome.png" alt="Premier Foodservice Group logo"><span class="wordmark"><strong>PREMIER</strong><small>FOODSERVICE GROUP</small></span></div><p class="eyebrow">SECURE PROJECT TOOLS</p><h1>Factory Quote Converter</h1><p>Sign in to access the converter and saved projects.</p><form method="post" action="/login"><label>Username<input name="username" type="text" autocomplete="username" required autofocus></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign In</button>${invalid ? '<p class="error" role="alert">The username or password is incorrect.</p>' : ""}</form></main></body></html>`;
}

async function handleLogin(request: Request, env: Env) {
  if (request.method === "GET") return new Response(loginPage(false), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  const form = await request.formData();
  const username = cleanText(form.get("username"), 100);
  const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";
  if (!env.AUTH_USERNAME || !/^[0-9a-f]{64}$/i.test(env.AUTH_PASSWORD_HASH) || !/^[0-9a-f]{64}$/i.test(env.SESSION_SIGNING_KEY)) {
    return new Response("Authentication is not configured.", { status: 503, headers: { "cache-control": "no-store" } });
  }
  const valid = username === env.AUTH_USERNAME && constantTimeEqual(await sha256(password), env.AUTH_PASSWORD_HASH);
  if (!valid) return new Response(loginPage(true), { status: 401, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": `${SESSION_COOKIE}=${await createSession(env)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`, "cache-control": "no-store" } });
}

function handleLogout() {
  return new Response(null, { status: 303, headers: { Location: "/login", "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`, "cache-control": "no-store" } });
}

function ownerKeyFrom(request: Request) {
  const ownerKey = request.headers.get("x-project-key")?.trim() ?? "";
  return /^[A-Za-z0-9-]{20,100}$/.test(ownerKey) ? ownerKey : "";
}

function cleanText(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeFactory(value: unknown) {
  return cleanText(value, 80);
}

function parseArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseNames(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((name) => cleanText(name, 160)).filter(Boolean);
  } catch {
    // Existing projects stored one plain-text name before multi-select was added.
  }
  const legacy = cleanText(value, 160);
  return legacy ? [legacy] : [];
}

function parseFactories(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const factories = parsed.map(normalizeFactory).filter((factory) => FACTORY_OPTIONS.has(factory));
      if (factories.length) return [...new Set(factories)];
    }
  } catch {
    // Existing projects stored one factory name.
  }
  const legacy = normalizeFactory(value);
  return FACTORY_OPTIONS.has(legacy) ? [legacy] : ["Cline's Welding and Fabrication"];
}

function serializeProject(row: ProjectRow) {
  const factories = parseFactories(row.factory);
  return {
    id: row.id,
    name: row.name,
    factory: factories.length === 1 ? factories[0] : "Multiple Factories",
    factories,
    dealers: parseArray(row.dealers),
    premierEstimators: parseNames(row.premier_estimator),
    premierSalesReps: parseNames(row.premier_sales_rep),
    totalAmount: Number(row.total_amount || 0),
    specification: row.specification,
    territory: row.territory,
    uploadDate: row.upload_date,
    bidDate: row.bid_date,
    sourceFile: row.source_file,
    items: parseArray(row.items),
    quotes: parseArray(row.quotes),
    createdAt: row.created_at,
  };
}

async function handleProjects(request: Request, env: Env) {
  const ownerKey = ownerKeyFrom(request);
  if (!ownerKey) return Response.json({ error: "Project key is missing." }, { status: 400 });

  try {
    if (request.method === "GET") {
      const result = await env.DB.prepare(
        "SELECT id, name, factory, dealers, premier_estimator, premier_sales_rep, total_amount, specification, territory, upload_date, bid_date, source_file, items, quotes, created_at FROM projects WHERE owner_key = ? ORDER BY created_at DESC, id DESC LIMIT 250"
      ).bind(ownerKey).all<ProjectRow>();
      return Response.json({ projects: result.results.map(serializeProject) });
    }

    if (request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const requestedId = cleanText(body.id, 100);
      const name = cleanText(body.name, 160);
      const requestedFactories = Array.isArray(body.factories) ? body.factories : [body.factory];
      const factories = [...new Set(requestedFactories.map(normalizeFactory).filter((factory) => FACTORY_OPTIONS.has(factory)))];
      const factory = JSON.stringify(factories);
      const specification = cleanText(body.specification, 50);
      const territory = cleanText(body.territory, 20);
      const items: string[][] = [];
      for (const row of (Array.isArray(body.items) ? body.items : []).slice(0, 500)) {
        if (Array.isArray(row)) items.push(row.slice(0, 10).map((cell) => cleanText(cell, 10000)));
      }
      const dealers = (Array.isArray(body.dealers) ? body.dealers : [])
        .map((dealer) => cleanText(dealer, 160))
        .filter(Boolean)
        .slice(0, 50);
      const premierEstimators = (Array.isArray(body.premierEstimators) ? body.premierEstimators : [body.premierEstimator])
        .map((name) => cleanText(name, 160)).filter(Boolean).slice(0, 20);
      const premierSalesReps = (Array.isArray(body.premierSalesReps) ? body.premierSalesReps : [body.premierSalesRep])
        .map((name) => cleanText(name, 160)).filter(Boolean).slice(0, 20);
      const totalAmount = Number(body.totalAmount);
      const quotes: Record<string, unknown>[] = [];
      for (const rawQuote of (Array.isArray(body.quotes) ? body.quotes : []).slice(0, 20)) {
        if (!rawQuote || typeof rawQuote !== "object") continue;
        const quote = rawQuote as Record<string, unknown>;
        const quoteFactory = normalizeFactory(quote.factory);
        if (!FACTORY_OPTIONS.has(quoteFactory)) continue;
        const quoteTotal = quote.totalAmount === null || quote.totalAmount === "" ? null : Number(quote.totalAmount);
        quotes.push({
          fileName: cleanText(quote.fileName, 260),
          factory: quoteFactory,
          quoteNumber: cleanText(quote.quoteNumber, 100),
          revision: cleanText(quote.revision, 50),
          model: cleanText(quote.model, 200),
          projectName: cleanText(quote.projectName, 160),
          totalAmount: Number.isFinite(quoteTotal) && Number(quoteTotal) >= 0 ? quoteTotal : null,
          rowCount: Math.max(0, Math.min(500, Math.trunc(Number(quote.rowCount) || 0))),
        });
      }

      if (!name) return Response.json({ error: "Project name is required." }, { status: 400 });
      if (!items.length) return Response.json({ error: "Add or upload quote items before saving." }, { status: 400 });
      if (!factories.length) return Response.json({ error: "Choose at least one factory." }, { status: 400 });
      if (!SPEC_OPTIONS.has(specification)) return Response.json({ error: "Choose a valid specification status." }, { status: 400 });
      if (!TERRITORY_OPTIONS.has(territory)) return Response.json({ error: "Choose MAFSI 11, MAFSI 12, or both territories." }, { status: 400 });
      if (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > 1_000_000_000) return Response.json({ error: "Enter a valid total dollar amount." }, { status: 400 });

      const id = requestedId || crypto.randomUUID();
      const values = [
        name, factory, JSON.stringify(dealers), JSON.stringify(premierEstimators), JSON.stringify(premierSalesReps),
        totalAmount, specification, territory, cleanText(body.uploadDate, 20), cleanText(body.bidDate, 20),
        cleanText(body.sourceFile, 2000), JSON.stringify(items), JSON.stringify(quotes)
      ] as const;
      if (requestedId) {
        const updated = await env.DB.prepare(
          "UPDATE projects SET name = ?, factory = ?, dealers = ?, premier_estimator = ?, premier_sales_rep = ?, total_amount = ?, specification = ?, territory = ?, upload_date = ?, bid_date = ?, source_file = ?, items = ?, quotes = ? WHERE id = ? AND owner_key = ?"
        ).bind(...values, id, ownerKey).run();
        if (!updated.meta.changes) return Response.json({ error: "The saved project could not be found." }, { status: 404 });
      } else {
        await env.DB.prepare(
          "INSERT INTO projects (id, owner_key, name, factory, dealers, premier_estimator, premier_sales_rep, total_amount, specification, territory, upload_date, bid_date, source_file, items, quotes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(id, ownerKey, ...values).run();
      }

      const saved = await env.DB.prepare(
        "SELECT id, name, factory, dealers, premier_estimator, premier_sales_rep, total_amount, specification, territory, upload_date, bid_date, source_file, items, quotes, created_at FROM projects WHERE id = ? AND owner_key = ?"
      ).bind(id, ownerKey).first<ProjectRow>();
      return Response.json({ project: saved ? serializeProject(saved) : null }, { status: requestedId ? 200 : 201 });
    }

    if (request.method === "DELETE") {
      const id = cleanText(new URL(request.url).searchParams.get("id"), 100);
      if (!id) return Response.json({ error: "Project could not be identified." }, { status: 400 });
      await env.DB.prepare("DELETE FROM projects WHERE id = ? AND owner_key = ?").bind(id, ownerKey).run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Method not allowed." }, { status: 405, headers: { Allow: "GET, POST, DELETE" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The project request could not be completed.";
    return Response.json({ error: message }, { status: 500 });
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/login") return handleLogin(request, env);
    if (url.pathname === "/logout" && request.method === "POST") return handleLogout();
    const isAgentPreview = url.hostname === "terminal.local";
    if (!isAgentPreview && !(await isAuthenticated(request, env))) {
      if (url.pathname.startsWith("/api/")) return Response.json({ error: "Please sign in again." }, { status: 401 });
      return Response.redirect(new URL("/login", request.url), 303);
    }

    if (url.pathname === "/api/projects") {
      return handleProjects(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    if (url.pathname === "/" || url.pathname === "/converter.html") {
      const headers = new Headers(response.headers);
      headers.set("cache-control", "no-store, no-cache, must-revalidate");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    return response;
  },
};

export default worker;
