import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { signConvexJwt } from "@/lib/convex-auth-token";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user?.id || !user.githubLogin) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const token = await signConvexJwt({
      subject: user.id,
      name: user.name,
      email: user.email,
      picture: user.image,
      githubLogin: user.githubLogin,
    });
    return Response.json({ token });
  } catch {
    return Response.json({ error: "Convex auth token is not configured." }, { status: 500 });
  }
}
