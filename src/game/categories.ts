import type { Category, CategoryId } from "./types.ts";

export const categories: readonly Category[] = [
  {
    id: "monuments",
    label: "Monuments",
    description: "Guess a famous monument or historic site in India.",
  },
  {
    id: "famous-indians",
    label: "Famous Indians",
    description:
      "Guess a well-known Indian from science, arts, cinema, history, business, literature, or public life.",
  },
  {
    id: "sportspersons",
    label: "Sportspersons",
    description: "Guess a famous Indian sportsperson.",
  },
  {
    id: "numbers",
    label: "Numbers",
    description: "Guess a whole number from 1 to 100.",
  },
];

export function isCategoryId(value: unknown): value is CategoryId {
  return (
    typeof value === "string" &&
    categories.some((category) => category.id === value)
  );
}
