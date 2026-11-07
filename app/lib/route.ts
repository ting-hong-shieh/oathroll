import { z } from "zod";

export async function apiRoute(work: () => Promise<unknown>) {
  try { return Response.json(await work(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: "Invalid request. Check your input and try again." }, { status: 400 });
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" ? error.status : 500;
    // Only deliberate client-safe errors are returned; provider internals stay private.
    const message = status < 500 && error instanceof Error ? error.message : "Couldn't reach the server. Try again.";
    return Response.json({ error: message }, { status });
  }
}
