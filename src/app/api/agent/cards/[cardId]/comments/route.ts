import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../../convex/_generated/dataModel";
import { agentError, getAgentRequestAuth } from "@/lib/agent-api";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ cardId: string }> },
) {
  const auth = getAgentRequestAuth(request);
  if (auth instanceof Response) return auth;

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  if (typeof body.body !== "string" || !body.body.trim()) {
    return Response.json({ error: "Comment body is required." }, { status: 400 });
  }

  const { cardId } = await context.params;
  const convex = new ConvexHttpClient(auth.convexUrl);

  try {
    const commentId = await convex.mutation(api.cards.addCommentFromAgent, {
      tokenHash: auth.tokenHash,
      cardId: cardId as Id<"cards">,
      body: body.body,
      agentName: typeof body.agentName === "string" ? body.agentName : undefined,
    });
    return Response.json({ ok: true, commentId });
  } catch (error) {
    return agentError(error);
  }
}
