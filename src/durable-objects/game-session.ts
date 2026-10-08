import { isExactGuess } from "../game/guess.ts";
import type { Answer, GameState } from "../game/types.ts";

type SqlValue = string | number | null | ArrayBuffer;
interface StoredGameState extends Record<string, SqlValue> { state: string; }
interface StoredReservation extends Record<string, SqlValue> {
  request_id: string; question_number: number; question: string; status: string; answer: string | null; created_at: number | null;
}

export class GameSession implements DurableObject {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS game_state (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS question_reservations (
          request_id TEXT PRIMARY KEY, question_number INTEGER NOT NULL, question TEXT NOT NULL,
          status TEXT NOT NULL, answer TEXT, created_at INTEGER
        )
      `);
      try { this.ctx.storage.sql.exec("ALTER TABLE question_reservations ADD COLUMN created_at INTEGER"); } catch { /* already migrated */ }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/init" && request.method === "POST") return this.initialize(request);
    if (path === "/state" && request.method === "GET") return this.getState();
    if (path === "/give-up" && request.method === "POST") return this.giveUp();
    if (path === "/prepare-question" && request.method === "POST") return this.prepareQuestion(request);
    if (path === "/complete-question" && request.method === "POST") return this.completeQuestion(request);
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  private async initialize(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (this.loadState()) return Response.json({ error: "Game session is already initialized." }, { status: 409 });
      let state: GameState;
      try { state = (await request.json()) as GameState; }
      catch { return Response.json({ error: "Invalid game state." }, { status: 400 }); }
      this.saveState(state);
      return Response.json({ ok: true });
    });
  }

  private getState(): Response {
    const state = this.loadState();
    if (!state) return Response.json({ error: "Game session not found." }, { status: 404 });
    return Response.json({ state: this.publicState(state) });
  }

  private async giveUp(): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const state = this.loadState();
      if (!state) return Response.json({ error: "Game session not found." }, { status: 404 });
      if (!state.finished) { state.finished = true; state.won = false; this.saveState(state); }
      return Response.json({ state: this.publicState(state), secret: state.secret });
    });
  }

  private async prepareQuestion(request: Request): Promise<Response> {
    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
    const question = typeof body === "object" && body !== null && "question" in body ? body.question : undefined;
    if (typeof question !== "string") return Response.json({ error: "Question must be a string." }, { status: 400 });
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length < 2 || trimmedQuestion.length > 300) {
      return Response.json({ error: "Question must be between 2 and 300 characters." }, { status: 400 });
    }

    return this.ctx.blockConcurrencyWhile(async () => {
      const state = this.loadState();
      if (!state) return Response.json({ error: "Game session not found." }, { status: 404 });
      const recovered = this.recoverStaleReservations(Date.now());
      if (recovered > 0) {
        this.refreshHistory(state);
        if (!state.finished && state.questionsUsed >= state.maxQuestions && this.pendingReservationCount() === 0) {
          state.finished = true;
          state.won = false;
        }
        this.saveState(state);
      }
      if (state.finished || state.questionsUsed >= state.maxQuestions) {
        return Response.json({ error: "Game session is already finished." }, { status: 409 });
      }
      const now = Date.now();
      if (state.lastQuestionAt !== undefined && now - state.lastQuestionAt < 800) {
        return Response.json({ error: "Please wait a moment before asking another question." }, { status: 429 });
      }
      const requestId = crypto.randomUUID();
      const questionNumber = state.questionsUsed + 1;
      state.questionsUsed = questionNumber;
      state.lastQuestionAt = now;
      this.saveState(state);
      this.ctx.storage.sql.exec(
        "INSERT INTO question_reservations (request_id, question_number, question, status, answer, created_at) VALUES (?, ?, ?, 'pending', NULL, ?)",
        requestId, questionNumber, trimmedQuestion, now,
      );
      return Response.json({
        requestId, category: state.category, secret: state.secret, question: trimmedQuestion,
        exactGuess: isExactGuess(state.secret, trimmedQuestion), questionNumber,
      });
    });
  }

  private async completeQuestion(request: Request): Promise<Response> {
    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
    const requestId = typeof body === "object" && body !== null && "requestId" in body ? body.requestId : undefined;
    const answer = typeof body === "object" && body !== null && "answer" in body ? body.answer : undefined;
    if (typeof requestId !== "string" || !requestId || !this.isAnswer(answer)) {
      return Response.json({ error: "Invalid question completion." }, { status: 400 });
    }

    return this.ctx.blockConcurrencyWhile(async () => {
      const state = this.loadState();
      if (!state) return Response.json({ error: "Game session not found." }, { status: 404 });
      const reservation = this.ctx.storage.sql.exec<StoredReservation>(
        "SELECT request_id, question_number, question, status, answer, created_at FROM question_reservations WHERE request_id = ?", requestId,
      ).toArray()[0];
      if (!reservation) return Response.json({ error: "Question request not found." }, { status: 404 });

      let finalAnswer: Answer = answer;
      if (reservation.status === "completed") {
        finalAnswer = this.isAnswer(reservation.answer) ? reservation.answer : "MAYBE";
      } else {
        this.ctx.storage.sql.exec("UPDATE question_reservations SET status = 'completed', answer = ? WHERE request_id = ?", answer, requestId);
      }

      this.refreshHistory(state);

      if (!state.finished && finalAnswer === "CORRECT") {
        state.finished = true; state.won = true;
      } else if (!state.finished && state.questionsUsed >= state.maxQuestions) {
        const pending = this.pendingReservationCount();
        if (pending === 0) { state.finished = true; state.won = false; }
      }
      this.saveState(state);
      return Response.json({ answer: finalAnswer, state: this.publicState(state), ...(state.finished ? { secret: state.secret } : {}) });
    });
  }

  private isAnswer(value: unknown): value is Answer {
    return value === "YES" || value === "NO" || value === "MAYBE" || value === "CORRECT";
  }

  private recoverStaleReservations(now: number): number {
    const stale = this.ctx.storage.sql.exec<{ count: number } & Record<string, SqlValue>>(
      "SELECT COUNT(*) AS count FROM question_reservations WHERE status = 'pending' AND created_at IS NOT NULL AND created_at < ?",
      now - 60_000,
    ).toArray()[0].count;
    if (stale > 0) {
      this.ctx.storage.sql.exec(
        "UPDATE question_reservations SET status = 'completed', answer = 'MAYBE' WHERE status = 'pending' AND created_at IS NOT NULL AND created_at < ?",
        now - 60_000,
      );
    }
    return stale;
  }

  private pendingReservationCount(): number {
    return this.ctx.storage.sql.exec<{ count: number } & Record<string, SqlValue>>(
      "SELECT COUNT(*) AS count FROM question_reservations WHERE status = 'pending'",
    ).toArray()[0].count;
  }

  private refreshHistory(state: GameState): void {
    const historyRows = this.ctx.storage.sql.exec<StoredReservation>(
      "SELECT request_id, question_number, question, status, answer, created_at FROM question_reservations WHERE status = 'completed' ORDER BY question_number",
    ).toArray();
    state.history = historyRows.filter((item) => this.isAnswer(item.answer)).map((item) => ({
      question: item.question, answer: item.answer as Answer,
    }));
  }

  private loadState(): GameState | null {
    const rows = this.ctx.storage.sql.exec<StoredGameState>("SELECT state FROM game_state WHERE id = 1").toArray();
    return rows.length === 0 ? null : (JSON.parse(rows[0].state) as GameState);
  }

  private saveState(state: GameState): void {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO game_state (id, state) VALUES (1, ?)", JSON.stringify(state));
  }

  private publicState(state: GameState) {
    return { category: state.category, questionsUsed: state.questionsUsed, maxQuestions: state.maxQuestions,
      finished: state.finished, won: state.won, createdAt: state.createdAt, history: state.history };
  }
}
