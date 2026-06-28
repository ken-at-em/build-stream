import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import {
  agentError,
  getAgentRequestAuth,
  isCardType,
  isProductionStatus,
  isSeverity,
} from "@/lib/agent-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getAgentRequestAuth(request);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const filter = normalizeFilter(url.searchParams.get("filter"));
  const convex = new ConvexHttpClient(auth.convexUrl);

  try {
    const cards = await convex.mutation(api.cards.listCardsForAgent, {
      tokenHash: auth.tokenHash,
      filter,
    });
    return Response.json({ cards });
  } catch (error) {
    return agentError(error);
  }
}

export async function POST(request: Request) {
  const auth = getAgentRequestAuth(request);
  if (auth instanceof Response) return auth;

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  if (!isCardType(body.type)) {
    return Response.json({ error: "Invalid card type." }, { status: 400 });
  }
  if (typeof body.summary !== "string" || !body.summary.trim()) {
    return Response.json({ error: "Summary is required." }, { status: 400 });
  }
  if (body.productionStatus !== undefined && !isProductionStatus(body.productionStatus)) {
    return Response.json({ error: "Invalid production status." }, { status: 400 });
  }
  if (body.severity !== undefined && !isSeverity(body.severity)) {
    return Response.json({ error: "Invalid severity." }, { status: 400 });
  }

  const convex = new ConvexHttpClient(auth.convexUrl);
  try {
    const cardId = await convex.mutation(api.cards.createCardFromAgent, {
      tokenHash: auth.tokenHash,
      agentName: typeof body.agentName === "string" ? body.agentName : undefined,
      type: body.type,
      summary: body.summary,
      body: typeof body.body === "string" ? body.body : undefined,
      branch: typeof body.branch === "string" ? body.branch : undefined,
      prUrl: typeof body.prUrl === "string" ? body.prUrl : undefined,
      links: Array.isArray(body.links) ? body.links : undefined,
      productionStatus: isProductionStatus(body.productionStatus)
        ? body.productionStatus
        : undefined,
      severity: isSeverity(body.severity) ? body.severity : undefined,
      workaround: typeof body.workaround === "string" ? body.workaround : undefined,
    });

    return Response.json({ ok: true, cardId });
  } catch (error) {
    return agentError(error);
  }
}

function normalizeFilter(filter: string | null) {
  if (isCardType(filter) || filter === "open" || filter === "resolved") {
    return filter;
  }
  return "all";
}
