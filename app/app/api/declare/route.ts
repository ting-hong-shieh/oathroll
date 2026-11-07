import { declareAction } from "@/lib/backend-selected";
import { DeclareRequestSchema } from "@/lib/schemas";
import { apiRoute } from "@/lib/route";
export const runtime = "nodejs";
export async function POST(request: Request) { return apiRoute(async () => declareAction(DeclareRequestSchema.parse(await request.json()))); }
