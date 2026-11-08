import { rollCheck } from "@/lib/backend-selected";
import { RollRequestSchema } from "@/lib/schemas";
import { apiRoute } from "@/lib/route";
import { spend } from "@/lib/quota";
export const runtime = "nodejs";
export async function POST(request: Request) { return apiRoute(async () => { const body = RollRequestSchema.parse(await request.json()); spend(request); return rollCheck(body); }); }
