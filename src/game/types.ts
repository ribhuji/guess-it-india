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
  answer: string;
}
