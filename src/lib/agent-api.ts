import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const agentScopes = [
  "cards:create",
  "cards:read",
  "cards:update",
  "comments:create",
] as const;

export type AgentScope = (typeof agentScopes)[number];

export const defaultAgentScopes: AgentScope[] = [
  "cards:create",
  "cards:read",
  "cards:update",
  "comments:create",
];

export const cardTypes = [
  "checkpoint",
  "risk",
  "question",
  "reviewable",
  "production",
  "shipped",
] as const;
export type CardType = (typeof cardTypes)[number];

export const cardStatuses = ["open", "resolved"] as const;
export type CardStatus = (typeof cardStatuses)[number];

export const productionStatuses = [
  "investigating",
  "mitigating",
  "monitoring",
  "resolved",
] as const;
export type ProductionStatus = (typeof productionStatuses)[number];

export const severities = ["none", "sev1", "sev2", "sev3"] as const;
export type Severity = (typeof severities)[number];

export function isCardType(value: unknown): value is CardType {
  return typeof value === "string" && cardTypes.includes(value as CardType);
}

export function isCardStatus(value: unknown): value is CardStatus {
  return typeof value === "string" && cardStatuses.includes(value as CardStatus);
}

export function isProductionStatus(value: unknown): value is ProductionStatus {
  return typeof value === "string" && productionStatuses.includes(value as ProductionStatus);
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && severities.includes(value as Severity);
}

export function parseBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.match(/^Bearer (.+)$/i)?.[1]?.trim();
}

export function getConvexUrl() {
  return process.env.NEXT_PUBLIC_CONVEX_URL;
}

export function getAgentRequestAuth(request: Request) {
  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    return Response.json({ error: "Convex is not configured." }, { status: 500 });
  }

  const token = parseBearerToken(request);
  if (!token) {
    return Response.json({ error: "Missing bearer token." }, { status: 401 });
  }

  try {
    return { convexUrl, tokenHash: hashAgentToken(token) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent auth is not configured.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export function agentError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "Agent request failed.";
  const message = sanitizeAgentError(rawMessage);
  const status = rawMessage.includes("Rate limit")
    ? 429
    : rawMessage.includes("Unauthorized")
      ? 403
      : rawMessage.includes("not found")
        ? 404
        : 400;
  return Response.json({ error: message }, { status });
}

function sanitizeAgentError(message: string) {
  if (message.includes("Rate limit")) return "Rate limit exceeded.";
  if (message.includes("Unauthorized")) return "Unauthorized agent token.";
  if (message.includes("not found")) return "Resource not found.";
  if (message.includes("required")) return message.split("\n")[0] ?? "Invalid request.";
  if (message.includes("Invalid")) return message.split("\n")[0] ?? "Invalid request.";
  return "Agent request failed.";
}

export function isTokenManagementAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_TOKEN_MANAGEMENT === "true";
}

export function generateAgentToken() {
  const prefix = randomBytes(5).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return {
    token: `bs_live_${prefix}_${secret}`,
    prefix,
  };
}

export function hashAgentToken(token: string) {
  const pepper = getAgentTokenPepper();
  return createHash("sha256").update(`${pepper}:${token}`).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function getAgentTokenPepper() {
  const pepper = process.env.AGENT_TOKEN_PEPPER;
  if (pepper) return pepper;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AGENT_TOKEN_PEPPER is required in production.");
  }
  return "buildstream-local-dev-pepper";
}
