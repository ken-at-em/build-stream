import { getPublicJwk } from "@/lib/convex-auth-token";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ keys: [getPublicJwk()] });
  } catch {
    return Response.json({ error: "Convex JWT public key is not configured." }, { status: 500 });
  }
}
