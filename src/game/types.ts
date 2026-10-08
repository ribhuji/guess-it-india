export type CategoryId =
  | "monuments"
  | "famous-indians"
  | "sportspersons"
  | "numbers";

export interface Category {
  id: CategoryId;
  label: string;
  description: string;
}

export interface Secret {
  answer: string | number;
}

export type Answer = "YES" | "NO" | "MAYBE" | "CORRECT";

export interface HistoryEntry {
  question: string;
  answer: Answer;
}

export interface GameState {
  category: CategoryId;
  secret: string | number;
  questionsUsed: number;
  maxQuestions: 20;
  finished: boolean;
  won: boolean;
  createdAt: string;
  history: HistoryEntry[];
  /** Internal Durable Object throttle state; never included in public responses. */
  lastQuestionAt?: number;
}
