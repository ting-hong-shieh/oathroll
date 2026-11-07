import { getWall } from "@/lib/backend-selected";
import { WallResponseSchema } from "@/lib/schemas";
import { apiRoute } from "@/lib/route";
export const runtime = "nodejs";
export async function GET() { return apiRoute(async () => WallResponseSchema.parse(await getWall())); }
