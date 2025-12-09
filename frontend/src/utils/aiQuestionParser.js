// src/utils/aiQuestionParser.js
export function parseQuestion(text) {
  if (!text) return { error: "Empty question." };

  let cleaned = text.trim();

  // Normalize casing and punctuation
  cleaned = cleaned
    .replace(/[?.]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\s*will\s*/i, "Will ")
    .replace(/\betherium\b/i, "Ethereum")
    .replace(/\bbit coin\b/i, "Bitcoin");

  // Extract known asset
  const cryptos = ["BDAG", "Ethereum", "Bitcoin", "Solana"];
  const asset = cryptos.find(c => new RegExp(c, "i").test(cleaned)) || "Unknown";

  // Extract numeric value (price)
  const matchValue = cleaned.match(/\$?(\d+(?:\.\d+)?)/);
  const value = matchValue ? matchValue[1] : null;

  // Extract date-like phrases
  const matchDate = cleaned.match(/(20\d{2}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*\d{0,2}/i);
  const date = matchDate ? matchDate[0] : null;

  // Extract condition (heuristic)
  let condition = "greater than";
  if (/less/i.test(cleaned)) condition = "less than";
  if (/equal/i.test(cleaned)) condition = "equal to";

  // Rebuild formatted question
  if (asset !== "Unknown" && value && date) {
    const normalized = `Will ${asset} be ${condition} $${value} by ${date}?`;
    return { asset, condition, value, date, normalized };
  } else {
    return { error: "Incomplete question. Please include asset, value, and date." };
  }
}
