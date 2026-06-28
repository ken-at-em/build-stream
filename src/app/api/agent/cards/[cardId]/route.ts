import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import {
  agentError,
  getAgentRequestAuth,
  isCardStatus,
  isProductionStatus,
  isSeverity,
} from "@/lib/agent-api";

export const dynamic = "force-dynamic";

export async function PATCH(
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
  if (body.status !== undefined && !isCardStatus(body.status)) {
    return Response.json({ error: "Invalid card status." }, { status: 400 });
  }
  if (body.productionStatus !== undefined && !isProductionStatus(body.productionStatus)) {
    return Response.json({ error: "Invalid production status." }, { status: 400 });
  }
  if (body.severity !== undefined && !isSeverity(body.severity)) {
    return Response.json({ error: "Invalid severity." }, { status: 400 });
  }

  const { cardId } = await context.params;
  const convex = new ConvexHttpClient(auth.convexUrl);

  try {
    await convex.mutation(api.cards.updateCardFromAgent, {
      tokenHash: auth.tokenHash,
      cardId: cardId as Id<"cards">,
      status: isCardStatus(body.status) ? body.status : undefined,
      productionStatus: isProductionStatus(body.productionStatus)
        ? body.productionStatus
        : undefined,
      severity: isSeverity(body.severity) ? body.severity : undefined,
      workaround: typeof body.workaround === "string" ? body.workaround : undefined,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return agentError(error);
  }
}
