import { attemptBribe } from "@/lib/backend-selected";
import { BribeRequestSchema } from "@/lib/schemas";
import { apiRoute } from "@/lib/route";
import { spend } from "@/lib/quota";
export const runtime = "nodejs";
export async function POST(request: Request) { return apiRoute(async () => { const body = BribeRequestSchema.parse(await request.json()); spend(request); return attemptBribe(body); }); }
