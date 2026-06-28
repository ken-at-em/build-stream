import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const cardType = v.union(
  v.literal("checkpoint"),
  v.literal("risk"),
  v.literal("question"),
  v.literal("reviewable"),
  v.literal("production"),
  v.literal("shipped"),
);

export const cardStatus = v.union(v.literal("open"), v.literal("resolved"));

export const productionStatus = v.union(
  v.literal("investigating"),
  v.literal("mitigating"),
  v.literal("monitoring"),
  v.literal("resolved"),
);

export const severity = v.union(
  v.literal("none"),
  v.literal("sev1"),
  v.literal("sev2"),
  v.literal("sev3"),
);

export const agentScope = v.union(
  v.literal("cards:create"),
  v.literal("cards:read"),
  v.literal("cards:update"),
  v.literal("comments:create"),
);

export const teamRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
);

export const linkValue = v.object({
  type: v.union(v.literal("pr"), v.literal("file"), v.literal("branch"), v.literal("url")),
  label: v.optional(v.string()),
  url: v.optional(v.string()),
  path: v.optional(v.string()),
});

export default defineSchema({
  users: defineTable({
    authSubject: v.string(),
    githubLogin: v.string(),
    email: v.optional(v.string()),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_auth_subject", ["authSubject"])
    .index("by_github_login", ["githubLogin"]),

  teams: defineTable({
    name: v.string(),
    slug: v.string(),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  teamMembers: defineTable({
    teamId: v.id("teams"),
    userId: v.string(),
    name: v.string(),
    role: teamRole,
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_team", ["teamId"])
    .index("by_team_user", ["teamId", "userId"]),

  teamInvites: defineTable({
    teamId: v.id("teams"),
    githubLogin: v.string(),
    role: teamRole,
    invitedByUserId: v.string(),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_login", ["githubLogin"])
    .index("by_team_login", ["teamId", "githubLogin"]),

  cards: defineTable({
    teamId: v.id("teams"),
    type: cardType,
    summary: v.string(),
    body: v.optional(v.string()),
    status: cardStatus,
    branch: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    links: v.array(linkValue),
    productionStatus: v.optional(productionStatus),
    severity: v.optional(severity),
    workaround: v.optional(v.string()),
    createdByType: v.union(v.literal("human"), v.literal("agent")),
    createdById: v.string(),
    createdByName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_team", ["teamId"])
    .index("by_team_status", ["teamId", "status"])
    .index("by_team_type", ["teamId", "type"]),

  comments: defineTable({
    cardId: v.id("cards"),
    teamId: v.id("teams"),
    body: v.string(),
    createdById: v.string(),
    createdByName: v.string(),
    createdAt: v.number(),
  })
    .index("by_card", ["cardId"])
    .index("by_team", ["teamId"]),

  agentTokens: defineTable({
    teamId: v.id("teams"),
    name: v.string(),
    tokenHash: v.optional(v.string()),
    tokenPrefix: v.optional(v.string()),
    scopes: v.optional(v.array(agentScope)),
    revokedAt: v.optional(v.number()),
    createdByUserId: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    rateLimitWindowStart: v.optional(v.number()),
    rateLimitCount: v.optional(v.number()),
    tokenSecret: v.optional(v.string()),
  })
    .index("by_team", ["teamId"])
    .index("by_hash", ["tokenHash"]),
});
