import type { CategoryId, Secret } from "./types.ts";

const monumentSecrets = [
  "Taj Mahal",
  "Qutub Minar",
  "Hampi",
  "Charminar",
  "Gateway of India",
  "Konark Sun Temple",
  "Sanchi Stupa",
  "Mysore Palace",
  "Victoria Memorial",
  "Red Fort",
  "Ajanta Caves",
  "Ellora Caves",
  "India Gate",
  "Fatehpur Sikri",
  "Meenakshi Temple",
  "Golden Temple",
  "Brihadeeswarar Temple",
  "Elephanta Caves",
  "Gol Gumbaz",
  "Jantar Mantar",
] as const;

const famousIndianSecrets = [
  "A. P. J. Abdul Kalam",
  "Shah Rukh Khan",
  "Lata Mangeshkar",
  "Ratan Tata",
  "Satyajit Ray",
  "Kalpana Chawla",
  "Viswanathan Anand",
  "M. S. Subbulakshmi",
  "Rabindranath Tagore",
  "Amartya Sen",
  "C. V. Raman",
  "Homi J. Bhabha",
  "Srinivasa Ramanujan",
  "Amitabh Bachchan",
  "A. R. Rahman",
  "S. P. Balasubrahmanyam",
  "Sushant Singh Rajput",
  "Ruskin Bond",
  "Arundhati Roy",
  "N. R. Narayana Murthy",
  "Dhirubhai Ambani",
  "Raja Ravi Varma",
  "Amrita Sher-Gil",
  "Sarojini Naidu",
  "M. F. Husain",
] as const;

const sportspersonSecrets = [
  "Sachin Tendulkar",
  "Virat Kohli",
  "P. V. Sindhu",
  "Neeraj Chopra",
  "Mary Kom",
  "Sunil Chhetri",
  "Sania Mirza",
  "Abhinav Bindra",
  "Mithali Raj",
  "Kapil Dev",
  "M. S. Dhoni",
  "Saina Nehwal",
  "Leander Paes",
  "Dhanraj Pillay",
  "Pullela Gopichand",
  "Hima Das",
  "Milkha Singh",
  "P. T. Usha",
  "Viswanathan Anand",
  "Bajrang Punia",
] as const;

const UINT32_RANGE = 2 ** 32;

function randomIndex(length: number): number {
  const limit = Math.floor(UINT32_RANGE / length) * length;
  const randomValue = new Uint32Array(1);

  do {
    crypto.getRandomValues(randomValue);
  } while (randomValue[0] >= limit);

  return randomValue[0] % length;
}

function pickFromList(values: readonly string[]): Secret {
  return { answer: values[randomIndex(values.length)] };
}

function pickNumber(): Secret {
  return { answer: randomIndex(100) + 1 };
}

export function pickSecret(category: CategoryId): Secret {
  switch (category) {
    case "monuments":
      return pickFromList(monumentSecrets);
    case "famous-indians":
      return pickFromList(famousIndianSecrets);
    case "sportspersons":
      return pickFromList(sportspersonSecrets);
    case "numbers":
      return pickNumber();
  }
}

export const secretCounts = {
  monuments: monumentSecrets.length,
  "famous-indians": famousIndianSecrets.length,
  sportspersons: sportspersonSecrets.length,
  numbers: 100,
} as const;
