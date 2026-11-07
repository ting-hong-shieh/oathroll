import { rollCheck } from "@/lib/backend-selected";
import { RollRequestSchema } from "@/lib/schemas";
import { apiRoute } from "@/lib/route";
export const runtime = "nodejs";
export async function POST(request: Request) { return apiRoute(async () => rollCheck(RollRequestSchema.parse(await request.json()))); }
