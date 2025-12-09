export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV !== "development") {
    return new Response("Forbidden", { status: 403 });
  }

  return Response.json({
    NEXT_PUBLIC_BDAG_RPC: process.env.NEXT_PUBLIC_BDAG_RPC,
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "✅ Loaded (hidden)" : "❌ Missing",
  });
}
