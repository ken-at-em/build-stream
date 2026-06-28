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
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const defaultTeamSlug = "buildstream-dev";
const defaultTeamName = "BuildStream Dev";
const rateLimitWindowMs = 60_000;
const rateLimitMaxRequests = 60;

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

const inviteRole = v.union(v.literal("admin"), v.literal("member"));

type AgentScope =
  | "cards:create"
  | "cards:read"
  | "cards:update"
  | "comments:create";
type TeamRole = "owner" | "admin" | "member";
type CardInput = {
  type: "checkpoint" | "risk" | "question" | "reviewable" | "production" | "shipped";
  productionStatus?: "investigating" | "mitigating" | "monitoring" | "resolved";
  severity?: "none" | "sev1" | "sev2" | "sev3";
  workaround?: string;
};
type ProductionStatus = NonNullable<CardInput["productionStatus"]>;
type AuthCtx = QueryCtx | MutationCtx;
type AuthorizedAgent = {
  token: Doc<"agentTokens">;
  teamId: Id<"teams">;
  actorId: string;
  actorName: string;
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

function normalizeGitHubLogin(value: string | undefined) {
  const normalized = value?.trim().replace(/^@/, "").toLowerCase();
  return normalized || undefined;
}

function hasScope(token: Doc<"agentTokens">, scope: AgentScope) {
  return token.scopes?.includes(scope) ?? false;
}

async function getIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required.");
  }
  const githubLogin = normalizeGitHubLogin(
    typeof identity.githubLogin === "string"
      ? identity.githubLogin
      : identity.preferredUsername ?? identity.nickname,
  );
  if (!githubLogin) {
    throw new Error("GitHub login is required.");
  }
  return { identity, githubLogin };
}

async function getCurrentUser(ctx: AuthCtx) {
  const { identity } = await getIdentity(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
    .first();
  if (!user) {
    throw new Error("Workspace is not initialized for this user.");
  }
  return user;
}

async function upsertCurrentUser(ctx: MutationCtx) {
  const { identity, githubLogin } = await getIdentity(ctx);
  const now = Date.now();
  const existing = await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
    .first();
  const name = cleanOptionalText(identity.name, 120) ?? githubLogin;

  if (existing) {
    await ctx.db.patch(existing._id, {
      githubLogin,
      email: cleanOptionalText(identity.email, 320),
      name,
      avatarUrl: cleanOptionalText(identity.pictureUrl, 1_000),
      updatedAt: now,
    });
    return {
      ...(await ctx.db.get(existing._id)),
      githubLogin,
      email: cleanOptionalText(identity.email, 320),
      name,
      avatarUrl: cleanOptionalText(identity.pictureUrl, 1_000),
      updatedAt: now,
    } as Doc<"users">;
  }

  const userId = await ctx.db.insert("users", {
    authSubject: identity.subject,
    githubLogin,
    email: cleanOptionalText(identity.email, 320),
    name,
    avatarUrl: cleanOptionalText(identity.pictureUrl, 1_000),
    createdAt: now,
    updatedAt: now,
  });

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("Unable to create user.");
  }
  return user;
}

async function requireMembership(
  ctx: AuthCtx,
  teamId: Id<"teams">,
  allowedRoles?: TeamRole[],
) {
  const user = await getCurrentUser(ctx);
  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_user", (q) => q.eq("teamId", teamId).eq("userId", user._id))
    .first();

  if (!membership || (allowedRoles && !allowedRoles.includes(membership.role))) {
    throw new Error("You are not authorized for this team.");
  }

  return { user, membership };
}

async function getAuthorizedAgentToken(
  ctx: MutationCtx,
  tokenHash: string,
  requiredScope: AgentScope,
): Promise<AuthorizedAgent> {
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

  if (token.kind === "personal") {
    if (!token.ownerUserId) {
      throw new Error("Unauthorized agent token.");
    }
    const ownerId = ctx.db.normalizeId("users", token.ownerUserId);
    const owner = ownerId ? await ctx.db.get(ownerId) : null;
    if (!owner) {
      throw new Error("Unauthorized agent token.");
    }
    const membership = await ctx.db
      .query("teamMembers")
      .withIndex("by_team_user", (q) => q.eq("teamId", token.teamId).eq("userId", owner._id))
      .first();
    if (!membership) {
      throw new Error("Unauthorized agent token.");
    }

    return {
      token,
      teamId: token.teamId,
      actorId: owner._id,
      actorName: `${owner.name}'s agent`,
    };
  }

  return {
    token,
    teamId: token.teamId,
    actorId: token._id,
    actorName: token.name,
  };
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

function baseStatusForProductionStatus(nextProductionStatus: ProductionStatus) {
  return nextProductionStatus === "resolved" ? "resolved" : "open";
}

function productionStatusForBaseStatus(status: "open" | "resolved"): ProductionStatus {
  return status === "resolved" ? "resolved" : "investigating";
}

function viewer(user: Doc<"users">) {
  return {
    userId: user._id,
    name: user.name,
    githubLogin: user.githubLogin,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

export const ensureWorkspace = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await upsertCurrentUser(ctx);
    const existingMembership = await ctx.db
      .query("teamMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (existingMembership) {
      const team = await ctx.db.get(existingMembership.teamId);
      if (!team) {
        throw new Error("Team membership points at a missing team.");
      }
      return {
        access: "granted" as const,
        viewer: viewer(user),
        teamId: team._id,
        teamName: team.name,
        role: existingMembership.role,
      };
    }

    const now = Date.now();
    const existingTeam = await ctx.db
      .query("teams")
      .withIndex("by_slug", (q) => q.eq("slug", defaultTeamSlug))
      .first();
    const bootstrapLogin = normalizeGitHubLogin(process.env.BUILDSTREAM_BOOTSTRAP_GITHUB_LOGIN);

    if (!existingTeam) {
      if (user.githubLogin !== bootstrapLogin) {
        return { access: "denied" as const, viewer: viewer(user) };
      }
      const teamId = await ctx.db.insert("teams", {
        name: defaultTeamName,
        slug: defaultTeamSlug,
        createdAt: now,
      });
      await ctx.db.insert("teamMembers", {
        teamId,
        userId: user._id,
        name: user.name,
        role: "owner",
        createdAt: now,
      });
      return {
        access: "granted" as const,
        viewer: viewer(user),
        teamId,
        teamName: defaultTeamName,
        role: "owner" as const,
      };
    }

    if (user.githubLogin === bootstrapLogin) {
      await ctx.db.insert("teamMembers", {
        teamId: existingTeam._id,
        userId: user._id,
        name: user.name,
        role: "owner",
        createdAt: now,
      });
      return {
        access: "granted" as const,
        viewer: viewer(user),
        teamId: existingTeam._id,
        teamName: existingTeam.name,
        role: "owner" as const,
      };
    }

    const invite = await ctx.db
      .query("teamInvites")
      .withIndex("by_team_login", (q) =>
        q.eq("teamId", existingTeam._id).eq("githubLogin", user.githubLogin),
      )
      .first();

    if (!invite || invite.acceptedAt || invite.revokedAt) {
      return { access: "denied" as const, viewer: viewer(user) };
    }

    await ctx.db.insert("teamMembers", {
      teamId: existingTeam._id,
      userId: user._id,
      name: user.name,
      role: invite.role,
      createdAt: now,
    });
    await ctx.db.patch(invite._id, { acceptedAt: now });

    return {
      access: "granted" as const,
      viewer: viewer(user),
      teamId: existingTeam._id,
      teamName: existingTeam.name,
      role: invite.role,
    };
  },
});

export const listTeamAdmin = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.teamId, ["owner", "admin"]);

    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const invites = await ctx.db
      .query("teamInvites")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const normalizedUserId = ctx.db.normalizeId("users", membership.userId);
        const user = normalizedUserId ? await ctx.db.get(normalizedUserId) : null;
        return {
          membershipId: membership._id,
          userId: membership.userId,
          name: user?.name ?? membership.name,
          githubLogin: user?.githubLogin,
          role: membership.role,
          createdAt: membership.createdAt,
        };
      }),
    );

    return {
      members,
      invites: invites.map((invite) => ({
        inviteId: invite._id,
        githubLogin: invite.githubLogin,
        role: invite.role,
        acceptedAt: invite.acceptedAt,
        revokedAt: invite.revokedAt,
        createdAt: invite.createdAt,
      })),
    };
  },
});

export const createTeamInvite = mutation({
  args: {
    teamId: v.id("teams"),
    githubLogin: v.string(),
    role: inviteRole,
  },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.teamId, ["owner", "admin"]);
    const githubLogin = normalizeGitHubLogin(args.githubLogin);
    if (!githubLogin) {
      throw new Error("GitHub username is required.");
    }

    const existingMemberUser = await ctx.db
      .query("users")
      .withIndex("by_github_login", (q) => q.eq("githubLogin", githubLogin))
      .first();
    if (existingMemberUser) {
      const existingMembership = await ctx.db
        .query("teamMembers")
        .withIndex("by_team_user", (q) =>
          q.eq("teamId", args.teamId).eq("userId", existingMemberUser._id),
        )
        .first();
      if (existingMembership) {
        throw new Error("User is already a team member.");
      }
    }

    const existingInvite = await ctx.db
      .query("teamInvites")
      .withIndex("by_team_login", (q) => q.eq("teamId", args.teamId).eq("githubLogin", githubLogin))
      .first();
    if (existingInvite && !existingInvite.acceptedAt && !existingInvite.revokedAt) {
      throw new Error("Invite already exists.");
    }

    return ctx.db.insert("teamInvites", {
      teamId: args.teamId,
      githubLogin,
      role: args.role,
      invitedByUserId: user._id,
      createdAt: Date.now(),
    });
  },
});

export const revokeTeamInvite = mutation({
  args: {
    teamId: v.id("teams"),
    inviteId: v.id("teamInvites"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.teamId, ["owner", "admin"]);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.teamId !== args.teamId || invite.acceptedAt) {
      throw new Error("Invite not found.");
    }
    await ctx.db.patch(args.inviteId, { revokedAt: Date.now() });
  },
});

export const listCards = query({
  args: {
    teamId: v.id("teams"),
    filter: v.optional(v.union(cardType, cardStatus, v.literal("all"))),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.teamId);
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
    ...cardInput,
  },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.teamId);
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
      createdById: user._id,
      createdByName: user.name,
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
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.teamId);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.teamId !== args.teamId) {
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
    productionStatus: v.optional(productionStatus),
    severity: v.optional(severity),
    workaround: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.teamId);
    const card = await ctx.db.get(args.cardId);

    if (!card || card.teamId !== args.teamId || card.type !== "production") {
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
    const card = await ctx.db.get(args.cardId);
    if (!card) {
      throw new Error("Card not found.");
    }
    await requireMembership(ctx, card.teamId);
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
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.teamId);
    const card = await ctx.db.get(args.cardId);
    const body = args.body.trim();

    if (!card || card.teamId !== args.teamId) {
      throw new Error("Card not found.");
    }
    if (!body) {
      throw new Error("Comment body is required.");
    }

    return ctx.db.insert("comments", {
      teamId: args.teamId,
      cardId: args.cardId,
      body,
      createdById: user._id,
      createdByName: user.name,
      createdAt: Date.now(),
    });
  },
});

export const listAgentTokens = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.teamId, ["owner", "admin"]);

    const tokens = await ctx.db
      .query("agentTokens")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .collect();

    return tokens
      .filter((token) => token.kind !== "personal")
      .map((token) => ({
        tokenId: token._id,
        name: token.name,
        kind: token.kind ?? "team",
        tokenPrefix: token.tokenPrefix ?? "legacy",
        scopes: token.scopes ?? [],
        createdAt: token.createdAt,
        lastUsedAt: token.lastUsedAt,
        revokedAt: token.revokedAt,
      }));
  },
});

export const listMyAgentTokens = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.teamId);

    const tokens = await ctx.db
      .query("agentTokens")
      .withIndex("by_team_owner", (q) => q.eq("teamId", args.teamId).eq("ownerUserId", user._id))
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
    name: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    scopes: v.array(agentScope),
  },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.teamId, ["owner", "admin"]);

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
      kind: "team",
      tokenHash: args.tokenHash,
      tokenPrefix: args.tokenPrefix,
      scopes: args.scopes,
      createdByUserId: user._id,
      createdAt: now,
    });

    return { tokenId };
  },
});

export const createMyAgentToken = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    scopes: v.array(agentScope),
  },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.teamId);

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
      name: args.name.trim() || "My local agent",
      kind: "personal",
      ownerUserId: user._id,
      tokenHash: args.tokenHash,
      tokenPrefix: args.tokenPrefix,
      scopes: args.scopes,
      createdByUserId: user._id,
      createdAt: now,
    });

    return { tokenId };
  },
});

export const revokeAgentToken = mutation({
  args: {
    teamId: v.id("teams"),
    tokenId: v.id("agentTokens"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.teamId, ["owner", "admin"]);
    const token = await ctx.db.get(args.tokenId);

    if (!token || token.teamId !== args.teamId || token.kind === "personal") {
      throw new Error("Agent token not found.");
    }

    await ctx.db.patch(args.tokenId, { revokedAt: Date.now() });
  },
});

export const revokeMyAgentToken = mutation({
  args: {
    teamId: v.id("teams"),
    tokenId: v.id("agentTokens"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireMembership(ctx, args.teamId);
    const token = await ctx.db.get(args.tokenId);

    if (
      !token ||
      token.teamId !== args.teamId ||
      token.kind !== "personal" ||
      token.ownerUserId !== user._id
    ) {
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
    const agent = await getAuthorizedAgentToken(ctx, args.tokenHash, "cards:create");

    const now = Date.now();
    const production = productionFields(args);
    return ctx.db.insert("cards", {
      teamId: agent.teamId,
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
      createdById: agent.actorId,
      createdByName: cleanOptionalText(args.agentName, 80) || agent.actorName,
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
    const agent = await getAuthorizedAgentToken(ctx, args.tokenHash, "cards:read");
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_team", (q) => q.eq("teamId", agent.teamId))
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
    const agent = await getAuthorizedAgentToken(ctx, args.tokenHash, "cards:update");
    const card = await ctx.db.get(args.cardId);
    if (!card || card.teamId !== agent.teamId) {
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
    const agent = await getAuthorizedAgentToken(ctx, args.tokenHash, "comments:create");
    const card = await ctx.db.get(args.cardId);
    const body = args.body.trim();

    if (!card || card.teamId !== agent.teamId) {
      throw new Error("Card not found.");
    }
    if (!body) {
      throw new Error("Comment body is required.");
    }
    if (body.length > 2_000) {
      throw new Error("Comment body must be 2000 characters or fewer.");
    }

    return ctx.db.insert("comments", {
      teamId: agent.teamId,
      cardId: args.cardId,
      body,
      createdById: agent.actorId,
      createdByName: cleanOptionalText(args.agentName, 80) || agent.actorName,
      createdAt: Date.now(),
    });
  },
});
