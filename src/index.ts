import { judgeQuestion } from "./ai/judge.ts";
import { categories, isCategoryId } from "./game/categories.ts";
import { evaluateNumberQuestion } from "./game/number-questions.ts";
import { pickSecret } from "./game/secrets.ts";
import type { Answer, CategoryId, GameState } from "./game/types.ts";

export { GameSession } from "./durable-objects/game-session.ts";

interface Env { ASSETS: Fetcher; GAME_SESSIONS: DurableObjectNamespace; AI: Ai; }
interface SessionResponse { state: GameState; secret?: string | number; }
interface PreparedResponse { requestId: string; category: CategoryId; secret: string | number; question: string; exactGuess: boolean; }

const APP_NAME = "Guess It India";
const MAX_JSON_BODY_BYTES = 16_384;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    },
  });
}

function assetResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
    if (url.pathname === "/api/health" && request.method === "GET") return jsonResponse({ ok: true, app: APP_NAME });
    if (url.pathname === "/api/categories" && request.method === "GET") return jsonResponse({ categories });
    if (url.pathname === "/api/games" && request.method === "POST") return startGame(request, env);

    const gameRoute = url.pathname.match(/^\/api\/games\/([^/]+)(?:\/(give-up|questions))?$/);
    if (gameRoute) {
      if (gameRoute[2] ? request.method !== "POST" : request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405);
      }
      let sessionId: string;
      try { sessionId = decodeURIComponent(gameRoute[1]); }
      catch { return jsonResponse({ error: "Game session not found." }, 404); }
      if (!SESSION_ID_PATTERN.test(sessionId)) return jsonResponse({ error: "Game session not found." }, 404);
      if (gameRoute[2] === "questions") return submitQuestion(request, env, sessionId);
      return gameRequest(env, sessionId, gameRoute[2]);
    }

    if (url.pathname.startsWith("/api/")) return jsonResponse({ error: "Not found" }, 404);
    return assetResponse(await env.ASSETS.fetch(request));
    } catch {
      console.error("Request failed", { path: url.pathname, method: request.method });
      return jsonResponse({ error: "Internal server error." }, 500);
    }
  },
};

async function parseJson(request: Request): Promise<unknown | Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_JSON_BODY_BYTES) return jsonResponse({ error: "Request body is too large." }, 413);
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) return jsonResponse({ error: "Request body is too large." }, 413);
    return JSON.parse(text) as unknown;
  } catch { return jsonResponse({ error: "Request body must be valid JSON." }, 400); }
}

async function startGame(request: Request, env: Env): Promise<Response> {
  const parsed = await parseJson(request);
  if (parsed instanceof Response) return parsed;
  const category = typeof parsed === "object" && parsed !== null && "category" in parsed ? parsed.category : undefined;
  if (!isCategoryId(category)) return jsonResponse({ error: "Invalid category" }, 400);
  const sessionId = crypto.randomUUID();
  const stub = env.GAME_SESSIONS.get(env.GAME_SESSIONS.idFromName(sessionId));
  const state: GameState = { category, secret: pickSecret(category).answer, questionsUsed: 0, maxQuestions: 20,
    finished: false, won: false, createdAt: new Date().toISOString(), history: [] };
  const initialized = await stub.fetch("https://game-session/init", { method: "POST", body: JSON.stringify(state) });
  if (!initialized.ok) return jsonResponse({ error: "Unable to initialize game session." }, 500);
  return jsonResponse({ sessionId, category: categories.find((item) => item.id === category), questionsUsed: 0, questionsLeft: 20, finished: false });
}

async function gameRequest(env: Env, sessionId: string, action?: string): Promise<Response> {
  if (!SESSION_ID_PATTERN.test(sessionId)) return jsonResponse({ error: "Game session not found." }, 404);
  const stub = env.GAME_SESSIONS.get(env.GAME_SESSIONS.idFromName(sessionId));
  const path = action === "give-up" ? "/give-up" : "/state";
  const result = await stub.fetch(`https://game-session${path}`, { method: action ? "POST" : "GET" });
  const body = (await result.json()) as SessionResponse | { error: string };
  if (!result.ok) return jsonResponse(body, result.status);
  if (action === "give-up" && "state" in body && body.secret !== undefined) {
    return jsonResponse({ sessionId, finished: body.state.finished, won: body.state.won, secret: body.secret });
  }
  if (!("state" in body)) return jsonResponse({ error: "Game session not found." }, 404);
  return jsonResponse({ sessionId, category: categories.find((item) => item.id === body.state.category),
    questionsUsed: body.state.questionsUsed, questionsLeft: body.state.maxQuestions - body.state.questionsUsed,
    finished: body.state.finished, won: body.state.won, history: body.state.history });
}

async function submitQuestion(request: Request, env: Env, sessionId: string): Promise<Response> {
  if (!SESSION_ID_PATTERN.test(sessionId)) return jsonResponse({ error: "Game session not found." }, 404);
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4_096) return jsonResponse({ error: "Request body is too large." }, 413);
  const stub = env.GAME_SESSIONS.get(env.GAME_SESSIONS.idFromName(sessionId));
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 4_096) return jsonResponse({ error: "Request body is too large." }, 413);
  const preparedResponse = await stub.fetch("https://game-session/prepare-question", {
    method: "POST", headers: { "content-type": "application/json" }, body,
  });
  const prepared = (await preparedResponse.json()) as PreparedResponse | { error: string };
  if (!preparedResponse.ok) return jsonResponse(prepared, preparedResponse.status);
  if (!("requestId" in prepared)) return jsonResponse({ error: "Unable to prepare question." }, 500);

  let answer: Answer = "MAYBE";
  if (prepared.exactGuess) {
    answer = "CORRECT";
  } else if (prepared.category === "numbers" && typeof prepared.secret === "number") {
    answer = evaluateNumberQuestion(prepared.secret, prepared.question) ?? "MAYBE";
  } else {
    try {
      answer = await judgeQuestion({ ai: env.AI, category: prepared.category, secret: prepared.secret, question: prepared.question });
    } catch {
      console.error("Workers AI judge failed", { category: prepared.category, questionLength: prepared.question.length });
      answer = "MAYBE";
    }
  }

  const completedResponse = await stub.fetch("https://game-session/complete-question", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId: prepared.requestId, answer }),
  });
  const completed = (await completedResponse.json()) as { answer: Answer; state: GameState; secret?: string | number } | { error: string };
  if (!completedResponse.ok) return jsonResponse(completed, completedResponse.status);
  if (!("state" in completed)) return jsonResponse({ error: "Unable to complete question." }, 500);
  return jsonResponse({ answer: completed.answer, questionsUsed: completed.state.questionsUsed,
    questionsLeft: completed.state.maxQuestions - completed.state.questionsUsed,
    finished: completed.state.finished, won: completed.state.won,
    ...(completed.secret !== undefined ? { secret: completed.secret } : {}) });
}
