// /frontend/src/app/api/parse-question/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Simple in-memory cache
const cache = new Map<string, string>();

export async function POST(req: Request) {
  const { text } = await req.json();
  if (!text) return NextResponse.json({ error: "No text provided" }, { status: 400 });

  // Check if OpenAI is configured
  if (!openai) {
    return NextResponse.json({ normalized: text }, { status: 200 }); // Return original text if no API key
  }

  // ✅ Check cache first
  if (cache.has(text)) {
    console.log("💾 Returning cached result for:", text);
    return NextResponse.json({ normalized: cache.get(text) });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Rewrite this into a yes/no market question in 20 words or fewer." },
        { role: "user", content: text },
      ],
      temperature: 0.2,
      max_tokens: 60,
    });

    const normalized = response.choices?.[0]?.message?.content?.trim();
    if (!normalized) throw new Error("No response from model");

    // ✅ Save to cache
    cache.set(text, normalized);
    console.log("✅ Cached new result:", normalized);

    return NextResponse.json({ normalized });
  } catch (error) {
    console.error("AI parse error:", error);
    return NextResponse.json({ error: "Parsing failed" }, { status: 500 });
  }
}
