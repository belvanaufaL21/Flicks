import { verifyMediaSignature } from "@/lib/security";
import { getStore } from "@/lib/store";

// Private photos are served only with a valid, unexpired signature (QA-12).
export async function GET(request: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  if (!verifyMediaSignature(id, url.searchParams.get("exp"), url.searchParams.get("sig"))) {
    return new Response("Forbidden", { status: 403 });
  }
  await getStore().purgeExpiredPhotos();
  const photo = await getStore().photo(id);
  if (!photo) return new Response("Gone", { status: 410 });
  return new Response(Buffer.from(photo.bytes), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
