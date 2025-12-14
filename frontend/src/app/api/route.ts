// Simplified parse route — OpenAI removed.
import { NextResponse } from "next/server";
import { parseQuestion } from "../../utils/aiQuestionParser";

export async function POST(req: Request) {
  try {
    const { text } = await req.json();
    if (!text) return NextResponse.json({ error: "No text provided" }, { status: 400 });

    const result = parseQuestion(text);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 200 });
    return NextResponse.json({ normalized: result.normalized }, { status: 200 });
  } catch (err) {
    console.error("parse route error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
