import { attemptBribe } from "@/lib/backend-selected";
import { BribeRequestSchema } from "@/lib/schemas";
import { apiRoute } from "@/lib/route";
export const runtime = "nodejs";
export async function POST(request: Request) { return apiRoute(async () => attemptBribe(BribeRequestSchema.parse(await request.json()))); }
