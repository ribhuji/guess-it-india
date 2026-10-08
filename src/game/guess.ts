const GUESS_PREFIXES = [
  "is the answer",
  "is the number",
  "i think it is",
  "my guess is",
  "is it the",
  "is it",
];

function stripSurroundingPunctuation(value: string): string {
  return value.replace(/^[\s.,!?;:"'()[\]{}]+|[\s.,!?;:"'()[\]{}]+$/g, "");
}

export function normalizeGuess(value: string): string {
  let normalized = value.toLowerCase().trim().replace(/\s+/g, " ");

  for (const prefix of GUESS_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix} `)) {
      normalized = normalized.slice(prefix.length).trim();
      break;
    }
  }

  return stripSurroundingPunctuation(normalized).trim();
}

export function isExactGuess(secret: string | number, question: string): boolean {
  const guess = normalizeGuess(question);
  if (!guess) return false;

  if (typeof secret === "number") {
    return /^\d+$/.test(guess) && Number(guess) === secret;
  }

  return guess === normalizeGuess(secret);
}
