import { createSession } from "@/lib/backend-selected";
import { SessionRequestSchema } from "@/lib/schemas";
import { apiRoute } from "@/lib/route";
import { spend } from "@/lib/quota";
export const runtime = "nodejs";
export async function POST(request: Request) { return apiRoute(async () => { const body = SessionRequestSchema.parse(await request.json()); spend(request); return createSession(body); }); }
