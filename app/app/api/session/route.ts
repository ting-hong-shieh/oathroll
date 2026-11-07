import { createSession } from "@/lib/backend-selected";
import { SessionRequestSchema } from "@/lib/schemas";
import { apiRoute } from "@/lib/route";
export const runtime = "nodejs";
export async function POST(request: Request) { return apiRoute(async () => createSession(SessionRequestSchema.parse(await request.json()))); }
