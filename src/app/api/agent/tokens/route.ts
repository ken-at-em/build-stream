import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  defaultAgentScopes,
  generateAgentToken,
  getConvexUrl,
  hashAgentToken,
  isTokenManagementAllowed,
} from "@/lib/agent-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isTokenManagementAllowed()) {
    return Response.json(
      { error: "Token management requires authenticated production wiring." },
      { status: 403 },
    );
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
    const result = await convex.mutation(api.cards.createAgentToken, {
      teamId: body.teamId as Id<"teams">,
      userId: typeof body.userId === "string" ? body.userId : "dev-user",
      userName: typeof body.userName === "string" ? body.userName : "Ken",
      name: typeof body.name === "string" ? body.name : "Default agent token",
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
