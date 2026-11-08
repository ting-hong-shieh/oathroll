import { declareAction } from "@/lib/backend-selected";
import { DeclareRequestSchema } from "@/lib/schemas";
import { apiRoute } from "@/lib/route";
import { spend } from "@/lib/quota";
export const runtime = "nodejs";
export async function POST(request: Request) { return apiRoute(async () => { const body = DeclareRequestSchema.parse(await request.json()); spend(request); return declareAction(body); }); }
