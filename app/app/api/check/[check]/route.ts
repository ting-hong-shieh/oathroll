import { getCheck } from "@/lib/backend-selected";
import { apiRoute } from "@/lib/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ check: string }> }) {
  return apiRoute(async () => getCheck((await context.params).check));
}
