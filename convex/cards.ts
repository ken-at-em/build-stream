import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  agentScope,
  cardStatus,
  cardType,
  linkValue,
  productionStatus,
  severity,
} from "./schema";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const defaultTeamSlug = "buildstream-dev";
const rateLimitWindowMs = 60_000;
const rateLimitMaxRequests = 60;

const userArgs = {
  userId: v.string(),
  userName: v.string(),
};

const cardInput = {
  type: cardType,
  summary: v.string(),
  body: v.optional(v.string()),
  branch: v.optional(v.string()),
  prUrl: v.optional(v.string()),
  links: v.optional(v.array(linkValue)),
  productionStatus: v.optional(productionStatus),
  severity: v.optional(severity),
  workaround: v.optional(v.string()),
};

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function requireSummary(summary: string) {
  const cleaned = cleanText(summary);
  if (!cleaned) {
    throw new Error("Summary is required.");
  }
  if (cleaned.length > 180) {
    throw new Error("Summary must be 180 characters or fewer.");
  }
  return cleaned;
}

function cleanOptionalText(value: string | undefined, maxLength: number) {
  const cleaned = value?.trim();
  if (!cleaned) return undefined;
  if (cleaned.length > maxLength) {
    throw new Error(`Value must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function hasScope(token: Doc<"agentTokens">, scope: AgentScope) {
  return token.scopes?.includes(scope) ?? false;
}

type AgentScope =
  | "cards:create"
  | "cards:read"
  | "cards:update"
  | "comments:create";

type CardInput = {
  type: "checkpoint" | "risk" | "question" | "reviewable" | "production" | "shipped";
  productionStatus?: "investigating" | "mitigating" | "monitoring" | "resolved";
  severity?: "none" | "sev1" | "sev2" | "sev3";
  workaround?: string;
};
type ProductionStatus = NonNullable<CardInput["productionStatus"]>;

async function getAuthorizedAgentToken(
  ctx: MutationCtx,
  tokenHash: string,
  requiredScope: AgentScope,
) {
  const token = await ctx.db
    .query("agentTokens")
    .withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();

  if (!token || token.revokedAt || !hasScope(token, requiredScope)) {
    throw new Error("Unauthorized agent token.");
  }

  const now = Date.now();
  const windowStart = token.rateLimitWindowStart ?? 0;
  const inCurrentWindow = now - windowStart < rateLimitWindowMs;
  const currentCount = inCurrentWindow ? token.rateLimitCount ?? 0 : 0;

  if (currentCount >= rateLimitMaxRequests) {
    throw new Error("Rate limit exceeded.");
  }

  await ctx.db.patch(token._id, {
    lastUsedAt: now,
    rateLimitWindowStart: inCurrentWindow ? windowStart : now,
    rateLimitCount: currentCount + 1,
  });

  return token;
}

function productionFields(input: CardInput) {
  if (input.type !== "production") {
    return {
      status: "open" as const,
      productionStatus: undefined,
      severity: undefined,
      workaround: undefined,
    };
  }

  const nextProductionStatus = input.productionStatus ?? "investigating";
  return {
    status: nextProductionStatus === "resolved" ? ("resolved" as const) : ("open" as const),
    productionStatus: nextProductionStatus,
    severity: input.severity === "none" ? undefined : input.severity,
    workaround: cleanOptionalText(input.workaround, 1_000),
  };
}

function baseStatusForProductionStatus(
  nextProductionStatus: ProductionStatus,
) {
  return nextProductionStatus === "resolved" ? "resolved" : "open";
}

function productionStatusForBaseStatus(status: "open" | "resolved"): ProductionStatus {
  return status === "resolved" ? "resolved" : "investigating";
}

export const ensureWorkspace = mutation({
  args: userArgs,
  handler: async (ctx, args) => {
    const existingMembership = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existingMembership) {
      const team = await ctx.db.get(existingMembership.teamId);
      if (!team) {
        throw new Error("Team membership points at a missing team.");
      }
      return { teamId: team._id, teamName: team.name };
    }

    const now = Date.now();
    const existingTeam = await ctx.db
      .query("teams")
      .withIndex("by_slug", (q) => q.eq("slug", defaultTeamSlug))
      .first();

    const teamId =
      existingTeam?._id ??
      (await ctx.db.insert("teams", {
        name: "BuildStream Dev",
        slug: defaultTeamSlug,
        createdAt: now,
      }));

    await ctx.db.insert("teamMembers", {
      teamId,
      userId: args.userId,
      name: args.userName,
      role: "owner",
      createdAt: now,
    });

    return { teamId, teamName: existingTeam?.name ?? "BuildStream Dev" };
  },
});

export const listTeams = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const teams = await Promise.all(
      memberships.map(async (membership) => {
        const team = await ctx.db.get(membership.teamId);
        return team
          ? {
              teamId: team._id,
              teamName: team.name,
              role: membership.role,
            }
          : null;
      }),
    );

    return teams.filter((team) => team !== null);
  },
});

export const listCards = query({
  args: {
    teamId: v.id("teams"),
    filter: v.optional(v.union(cardType, cardStatus, v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .collect();

    const filtered = cards.filter((card) => {
      if (!args.filter || args.filter === "all") return true;
      if (args.filter === "open" || args.filter === "resolved") {
        return card.status === args.filter;
      }
      return card.type === args.filter;
    });

    return Promise.all(
      filtered.map(async (card) => {
        const comments = await ctx.db
          .query("comments")
          .withIndex("by_card", (q) => q.eq("cardId", card._id))
          .collect();
        return { ...card, commentCount: comments.length };
      }),
    );
  },
});

export const createCard = mutation({
  args: {
    teamId: v.id("teams"),
    ...userArgs,
    ...cardInput,
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", args.teamId).eq("userId", args.userId))
      .first();

    if (!membership) {
      throw new Error("You are not a member of this team.");
    }

    const now = Date.now();
    const production = productionFields(args);
    return ctx.db.insert("cards", {
      teamId: args.teamId,
      type: args.type,
      summary: requireSummary(args.summary),
      body: args.body?.trim() || undefined,
      status: production.status,
      branch: args.branch?.trim() || undefined,
      prUrl: args.prUrl?.trim() || undefined,
      links: args.links ?? [],
      productionStatus: production.productionStatus,
      severity: production.severity,
      workaround: production.workaround,
      createdByType: "human",
      createdById: args.userId,
      createdByName: args.userName,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCardStatus = mutation({
  args: {
    teamId: v.id("teams"),
    cardId: v.id("cards"),
    status: cardStatus,
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", args.teamId).eq("userId", args.userId))
      .first();
    const card = await ctx.db.get(args.cardId);

    if (!membership || !card || card.teamId !== args.teamId) {
      throw new Error("Card not found.");
    }

    await ctx.db.patch(args.cardId, {
      status: args.status,
      productionStatus:
        card.type === "production"
          ? args.status === "resolved"
            ? "resolved"
            : "investigating"
          : card.productionStatus,
      updatedAt: Date.now(),
    });
  },
});

export const updateProductionCard = mutation({
  args: {
    teamId: v.id("teams"),
    cardId: v.id("cards"),
    userId: v.string(),
    productionStatus: v.optional(productionStatus),
    severity: v.optional(severity),
    workaround: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", args.teamId).eq("userId", args.userId))
      .first();
    const card = await ctx.db.get(args.cardId);

    if (!membership || !card || card.teamId !== args.teamId || card.type !== "production") {
      throw new Error("Production card not found.");
    }

    const patch: Partial<
      Pick<
        Doc<"cards">,
        "productionStatus" | "severity" | "status" | "updatedAt" | "workaround"
      >
    > = {
      updatedAt: Date.now(),
    };

    if (args.productionStatus !== undefined) {
      patch.productionStatus = args.productionStatus;
      patch.status = baseStatusForProductionStatus(args.productionStatus);
    }
    if (args.severity !== undefined) {
      patch.severity = args.severity === "none" ? undefined : args.severity;
    }
    if (args.workaround !== undefined) {
      patch.workaround = cleanOptionalText(args.workaround, 1_000);
    }

    await ctx.db.patch(args.cardId, patch);
  },
});

export const listComments = query({
  args: { cardId: v.id("cards") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("comments")
      .withIndex("by_card", (q) => q.eq("cardId", args.cardId))
      .collect();
  },
});

export const addComment = mutation({
  args: {
    teamId: v.id("teams"),
    cardId: v.id("cards"),
    ...userArgs,
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", args.teamId).eq("userId", args.userId))
      .first();
    const card = await ctx.db.get(args.cardId);
    const body = args.body.trim();

    if (!membership || !card || card.teamId !== args.teamId) {
      throw new Error("Card not found.");
    }
    if (!body) {
      throw new Error("Comment body is required.");
    }

    return ctx.db.insert("comments", {
      teamId: args.teamId,
      cardId: args.cardId,
      body,
      createdById: args.userId,
      createdByName: args.userName,
      createdAt: Date.now(),
    });
  },
});

export const listAgentTokens = query({
  args: {
    teamId: v.id("teams"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", args.teamId).eq("userId", args.userId))
      .first();
    if (!membership) {
      throw new Error("You are not a member of this team.");
    }

    const tokens = await ctx.db
      .query("agentTokens")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .collect();

    return tokens.map((token) => ({
      tokenId: token._id,
      name: token.name,
      tokenPrefix: token.tokenPrefix ?? "legacy",
      scopes: token.scopes ?? [],
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
      revokedAt: token.revokedAt,
    }));
  },
});

export const createAgentToken = mutation({
  args: {
    teamId: v.id("teams"),
    ...userArgs,
    name: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    scopes: v.array(agentScope),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", args.teamId).eq("userId", args.userId))
      .first();
    if (!membership) {
      throw new Error("You are not a member of this team.");
    }

    const existingHash = await ctx.db
      .query("agentTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (existingHash) {
      throw new Error("Token collision.");
    }

    const now = Date.now();
    const tokenId = await ctx.db.insert("agentTokens", {
      teamId: args.teamId,
      name: args.name.trim() || "Agent token",
      tokenHash: args.tokenHash,
      tokenPrefix: args.tokenPrefix,
      scopes: args.scopes,
      createdByUserId: args.userId,
      createdAt: now,
    });

    return { tokenId };
  },
});

export const revokeAgentToken = mutation({
  args: {
    teamId: v.id("teams"),
    userId: v.string(),
    tokenId: v.id("agentTokens"),
  },
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", args.teamId).eq("userId", args.userId))
      .first();
    const token = await ctx.db.get(args.tokenId);

    if (!membership || !token || token.teamId !== args.teamId) {
      throw new Error("Agent token not found.");
    }

    await ctx.db.patch(args.tokenId, { revokedAt: Date.now() });
  },
});

export const createCardFromAgent = mutation({
  args: {
    tokenHash: v.string(),
    agentName: v.optional(v.string()),
    ...cardInput,
  },
  handler: async (ctx, args) => {
    const token = await getAuthorizedAgentToken(ctx, args.tokenHash, "cards:create");

    const now = Date.now();
    const production = productionFields(args);
    return ctx.db.insert("cards", {
      teamId: token.teamId,
      type: args.type,
      summary: requireSummary(args.summary),
      body: cleanOptionalText(args.body, 2_000),
      status: production.status,
      branch: cleanOptionalText(args.branch, 200),
      prUrl: cleanOptionalText(args.prUrl, 1_000),
      links: args.links ?? [],
      productionStatus: production.productionStatus,
      severity: production.severity,
      workaround: production.workaround,
      createdByType: "agent",
      createdById: token._id,
      createdByName: cleanOptionalText(args.agentName, 80) || token.name,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listCardsForAgent = mutation({
  args: {
    tokenHash: v.string(),
    filter: v.optional(v.union(cardType, cardStatus, v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const token = await getAuthorizedAgentToken(ctx, args.tokenHash, "cards:read");
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_team", (q) => q.eq("teamId", token.teamId))
      .order("desc")
      .collect();

    const filtered = cards.filter((card) => {
      if (!args.filter || args.filter === "all") return true;
      if (args.filter === "open" || args.filter === "resolved") {
        return card.status === args.filter;
      }
      return card.type === args.filter;
    });

    return Promise.all(
      filtered.map(async (card) => {
        const comments = await ctx.db
          .query("comments")
          .withIndex("by_card", (q) => q.eq("cardId", card._id))
          .collect();
        return { ...card, commentCount: comments.length };
      }),
    );
  },
});

export const updateCardFromAgent = mutation({
  args: {
    tokenHash: v.string(),
    cardId: v.id("cards"),
    status: v.optional(cardStatus),
    productionStatus: v.optional(productionStatus),
    severity: v.optional(severity),
    workaround: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const token = await getAuthorizedAgentToken(ctx, args.tokenHash, "cards:update");
    const card = await ctx.db.get(args.cardId);
    if (!card || card.teamId !== token.teamId) {
      throw new Error("Card not found.");
    }

    const nextProductionStatus =
      card.type === "production"
        ? args.productionStatus ??
          (args.status ? productionStatusForBaseStatus(args.status) : card.productionStatus)
        : undefined;
    const patch =
      card.type === "production"
        ? {
            productionStatus: nextProductionStatus,
            status: nextProductionStatus
              ? baseStatusForProductionStatus(nextProductionStatus)
              : args.status ?? card.status,
            severity: args.severity === "none" ? undefined : args.severity ?? card.severity,
            workaround:
              args.workaround === undefined
                ? card.workaround
                : cleanOptionalText(args.workaround, 1_000),
            updatedAt: Date.now(),
          }
        : {
            status: args.status ?? card.status,
            updatedAt: Date.now(),
          };

    await ctx.db.patch(args.cardId, patch);
  },
});

export const addCommentFromAgent = mutation({
  args: {
    tokenHash: v.string(),
    cardId: v.id("cards"),
    agentName: v.optional(v.string()),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const token = await getAuthorizedAgentToken(ctx, args.tokenHash, "comments:create");
    const card = await ctx.db.get(args.cardId);
    const body = args.body.trim();

    if (!card || card.teamId !== token.teamId) {
      throw new Error("Card not found.");
    }
    if (!body) {
      throw new Error("Comment body is required.");
    }
    if (body.length > 2_000) {
      throw new Error("Comment body must be 2000 characters or fewer.");
    }

    return ctx.db.insert("comments", {
      teamId: token.teamId,
      cardId: args.cardId,
      body,
      createdById: token._id,
      createdByName: cleanOptionalText(args.agentName, 80) || token.name,
      createdAt: Date.now(),
    });
  },
});
