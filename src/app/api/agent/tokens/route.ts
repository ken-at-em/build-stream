import { ConvexHttpClient } from "convex/browser";
import { getServerSession } from "next-auth";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { authOptions } from "@/auth";
import {
  defaultAgentScopes,
  generateAgentToken,
  getConvexUrl,
  hashAgentToken,
} from "@/lib/agent-api";
import { signConvexJwt } from "@/lib/convex-auth-token";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id || !user.githubLogin) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    return Response.json({ error: "Convex is not configured." }, { status: 500 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  if (typeof body.teamId !== "string") {
    return Response.json({ error: "teamId is required." }, { status: 400 });
  }

  const { token, prefix } = generateAgentToken();
  const convex = new ConvexHttpClient(convexUrl);

  try {
    convex.setAuth(
      await signConvexJwt({
        subject: user.id,
        name: user.name,
        email: user.email,
        picture: user.image,
        githubLogin: user.githubLogin,
      }),
    );
    const result = await convex.mutation(api.cards.createMyAgentToken, {
      teamId: body.teamId as Id<"teams">,
      name: typeof body.name === "string" ? body.name : "My local agent",
      tokenHash: hashAgentToken(token),
      tokenPrefix: prefix,
      scopes: defaultAgentScopes,
    });

    return Response.json({
      ...result,
      token,
      tokenPrefix: prefix,
      scopes: defaultAgentScopes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create token.";
    return Response.json({ error: message }, { status: 400 });
  }
}
