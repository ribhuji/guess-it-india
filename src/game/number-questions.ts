import type { Answer } from "./types.ts";

function result(value: boolean): Answer {
  return value ? "YES" : "NO";
}

function isPrime(value: number): boolean {
  if (value < 2) return false;
  for (let divisor = 2; divisor * divisor <= value; divisor += 1) {
    if (value % divisor === 0) return false;
  }
  return true;
}

export function evaluateNumberQuestion(secret: number, question: string): Answer | null {
  const normalized = question
    .trim()
    .toLowerCase()
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ");

  if (/^(?:is it )?even$/.test(normalized)) return result(secret % 2 === 0);
  if (/^(?:is it )?odd$/.test(normalized)) return result(secret % 2 !== 0);
  if (/^(?:is it )?prime$/.test(normalized)) return result(isPrime(secret));
  if (/^(?:is it )?a perfect square$/.test(normalized)) {
    return result(Number.isInteger(Math.sqrt(secret)));
  }

  let match = normalized.match(/^(?:is it )?greater than or equal to (\d+)$/);
  if (match) return result(secret >= Number(match[1]));
  match = normalized.match(/^(?:is it )?less than or equal to (\d+)$/);
  if (match) return result(secret <= Number(match[1]));
  match = normalized.match(/^(?:is it )?greater than (\d+)$/);
  if (match) return result(secret > Number(match[1]));
  match = normalized.match(/^(?:is it )?less than (\d+)$/);
  if (match) return result(secret < Number(match[1]));
  match = normalized.match(/^(?:is it )?divisible by (\d+)$/);
  if (match && Number(match[1]) !== 0) return result(secret % Number(match[1]) === 0);
  match = normalized.match(/^(?:is it )?a multiple of (\d+)$/);
  if (match && Number(match[1]) !== 0) return result(secret % Number(match[1]) === 0);

  return null;
}
