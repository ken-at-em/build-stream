"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleHelp,
  Copy,
  Flame,
  GitBranch,
  LogOut,
  MessageSquare,
  Radio,
  Send,
  ShipWheel,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CardType = "checkpoint" | "risk" | "question" | "reviewable" | "production" | "shipped";
type Filter = "all" | CardType | "resolved";
type ProductionStatus = "investigating" | "mitigating" | "monitoring" | "resolved";
type Severity = "none" | "sev1" | "sev2" | "sev3";
type TeamRole = "owner" | "admin" | "member";
type Workspace =
  | {
      access: "granted";
      teamId: Id<"teams">;
      teamName: string;
      role: TeamRole;
      viewer: {
        userId: string;
        name: string;
        githubLogin: string;
        email?: string;
        avatarUrl?: string;
      };
    }
  | {
      access: "denied";
      viewer: {
        userId: string;
        name: string;
        githubLogin: string;
        email?: string;
        avatarUrl?: string;
      };
    };

const cardMeta: Record<
  CardType,
  {
    label: string;
    icon: typeof Radio;
    badgeClassName: string;
  }
> = {
  checkpoint: {
    label: "Update",
    icon: Radio,
    badgeClassName:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  risk: {
    label: "Risk",
    icon: AlertTriangle,
    badgeClassName:
      "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  },
  question: {
    label: "Ask",
    icon: CircleHelp,
    badgeClassName:
      "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  reviewable: {
    label: "Review",
    icon: Sparkles,
    badgeClassName:
      "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  production: {
    label: "Production",
    icon: Flame,
    badgeClassName:
      "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
  },
  shipped: {
    label: "Shipped",
    icon: ShipWheel,
    badgeClassName:
      "border-lime-500/25 bg-lime-500/10 text-lime-700 dark:text-lime-300",
  },
};

const cardTypes = Object.keys(cardMeta) as CardType[];

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "risk", label: "Risks" },
  { value: "question", label: "Questions" },
  { value: "reviewable", label: "Reviews" },
  { value: "production", label: "Production" },
  { value: "resolved", label: "Resolved" },
];

const productionStatusLabels: Record<ProductionStatus, string> = {
  investigating: "Investigating",
  mitigating: "Mitigating",
  monitoring: "Monitoring",
  resolved: "Resolved",
};

const severityLabels: Record<Severity, string> = {
  none: "No severity",
  sev1: "SEV1",
  sev2: "SEV2",
  sev3: "SEV3",
};

export function BuildStreamApp() {
  const { data: session, status: sessionStatus } = useSession();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedCardId, setSelectedCardId] = useState<Id<"cards"> | null>(null);
  const [summary, setSummary] = useState("");
  const [type, setType] = useState<CardType>("risk");
  const [productionStatus, setProductionStatus] = useState<ProductionStatus>("investigating");
  const [severity, setSeverity] = useState<Severity>("none");
  const [workaround, setWorkaround] = useState("");
  const [comment, setComment] = useState("");
  const [inviteLogin, setInviteLogin] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [copiedAgentCurl, setCopiedAgentCurl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureWorkspace = useMutation(api.cards.ensureWorkspace);
  const createCard = useMutation(api.cards.createCard);
  const updateCardStatus = useMutation(api.cards.updateCardStatus);
  const updateProductionCard = useMutation(api.cards.updateProductionCard);
  const addComment = useMutation(api.cards.addComment);
  const revokeAgentToken = useMutation(api.cards.revokeAgentToken);
  const createTeamInvite = useMutation(api.cards.createTeamInvite);
  const revokeTeamInvite = useMutation(api.cards.revokeTeamInvite);

  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      return;
    }

    let cancelled = false;
    ensureWorkspace({})
      .then((workspace) => {
        if (cancelled) return;
        setWorkspace(workspace as Workspace);
      })
      .catch((cause) => setError(errorMessage(cause)));

    return () => {
      cancelled = true;
    };
  }, [ensureWorkspace, sessionStatus]);

  const teamId = workspace?.access === "granted" ? workspace.teamId : null;
  const teamName = workspace?.access === "granted" ? workspace.teamName : "BuildStream";
  const viewer = workspace?.viewer;
  const role = workspace?.access === "granted" ? workspace.role : null;
  const canManageTeam = role === "owner" || role === "admin";

  const cards = useQuery(
    api.cards.listCards,
    teamId ? { teamId, filter: "all" } : "skip",
  );

  const selectedCard = useMemo(() => {
    if (!cards?.length) return null;
    return cards.find((card) => card._id === selectedCardId) ?? cards[0];
  }, [cards, selectedCardId]);

  const agentCurl = useMemo(() => {
    if (!agentToken) return "";
    const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
    return `curl -X POST ${origin}/api/agent/cards \\
  -H "Authorization: Bearer ${agentToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"risk","summary":"Migration touches trigger behavior; need DB review.","agentName":"Codex"}'`;
  }, [agentToken]);

  const comments = useQuery(
    api.cards.listComments,
    selectedCard ? { cardId: selectedCard._id } : "skip",
  );
  const agentTokens = useQuery(
    api.cards.listAgentTokens,
    teamId && canManageTeam ? { teamId } : "skip",
  );
  const teamAdmin = useQuery(
    api.cards.listTeamAdmin,
    teamId && canManageTeam ? { teamId } : "skip",
  );

  const extractedPrUrl = useMemo(() => extractPrUrl(summary), [summary]);
  const needsReviewLink = type === "reviewable" && !extractedPrUrl;
  const canPost = Boolean(summary.trim()) && !needsReviewLink;
  const activeProductionCards = useMemo(
    () =>
      cards?.filter(
        (card) =>
          card.type === "production" &&
          card.status !== "resolved" &&
          card.productionStatus !== "resolved",
      ) ?? [],
    [cards],
  );
  const feedCards = useMemo(
    () =>
      cards?.filter((card) => {
        const isPinnedProduction =
          card.type === "production" &&
          card.status !== "resolved" &&
          card.productionStatus !== "resolved";
        if (isPinnedProduction) return false;
        if (filter === "all") return true;
        if (filter === "resolved") return card.status === "resolved";
        return card.type === filter;
      }) ?? [],
    [cards, filter],
  );

  async function submitCard(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamId) return;

    setError(null);
    try {
      const cardId = await createCard({
        teamId,
        type,
        summary,
        body: undefined,
        branch: undefined,
        prUrl: type === "reviewable" ? extractedPrUrl : undefined,
        links: [],
        productionStatus: type === "production" ? productionStatus : undefined,
        severity: type === "production" ? severity : undefined,
        workaround: type === "production" ? workaround : undefined,
      });
      setSummary("");
      setProductionStatus("investigating");
      setSeverity("none");
      setWorkaround("");
      setSelectedCardId(cardId);
      setFilter("all");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamId || !selectedCard) return;

    setError(null);
    try {
      await addComment({
        teamId,
        cardId: selectedCard._id,
        body: comment,
      });
      setComment("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function toggleSelectedStatus() {
    if (!teamId || !selectedCard) return;
    setError(null);
    try {
      await updateCardStatus({
        teamId,
        cardId: selectedCard._id,
        status: selectedCard.status === "open" ? "resolved" : "open",
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function updateSelectedProductionCard(next: {
    productionStatus?: ProductionStatus;
    severity?: Severity;
    workaround?: string;
  }) {
    if (!teamId || !selectedCard || selectedCard.type !== "production") return;
    setError(null);
    try {
      await updateProductionCard({
        teamId,
        cardId: selectedCard._id,
        productionStatus: next.productionStatus ?? selectedCard.productionStatus ?? "investigating",
        severity: next.severity ?? selectedCard.severity ?? "none",
        workaround: next.workaround ?? selectedCard.workaround ?? "",
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function createAgentToken() {
    if (!teamId) return;
    setError(null);
    try {
      const response = await fetch("/api/agent/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          name: "Default agent token",
        }),
      });
      const payload = await response.json();
      if (!response.ok || typeof payload.token !== "string") {
        throw new Error(payload.error ?? "Unable to create agent token.");
      }
      setAgentToken(payload.token);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function revokeToken(tokenId: Id<"agentTokens">) {
    if (!teamId) return;
    setError(null);
    try {
      await revokeAgentToken({
        teamId,
        tokenId,
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamId || !inviteLogin.trim()) return;
    setError(null);
    try {
      await createTeamInvite({
        teamId,
        githubLogin: inviteLogin,
        role: inviteRole,
      });
      setInviteLogin("");
      setInviteRole("member");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function revokeInvite(inviteId: Id<"teamInvites">) {
    if (!teamId) return;
    setError(null);
    try {
      await revokeTeamInvite({ teamId, inviteId });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function copyAgentCurl() {
    if (!agentCurl) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(agentCurl);
      setCopiedAgentCurl(true);
      window.setTimeout(() => setCopiedAgentCurl(false), 1600);
    } catch {
      setError("Unable to copy automatically. Select the command text and copy it manually.");
    }
  }

  if (sessionStatus === "loading") {
    return <CenteredState title="Loading BuildStream" body="Checking your GitHub session..." />;
  }

  if (sessionStatus === "unauthenticated") {
    return <SignInScreen />;
  }

  if (!workspace) {
    return <CenteredState title="Loading workspace" body="Checking your team access..." />;
  }

  if (workspace.access === "denied") {
    return <AccessDeniedScreen viewer={workspace.viewer} />;
  }

  const viewerInitial = (viewer?.name ?? session?.user?.name ?? "U").charAt(0).toUpperCase();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_360px]">
        <aside className="border-b bg-sidebar px-5 py-5 text-sidebar-foreground lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GitBranch size={18} />
              </div>
              <div>
                <h1 className="text-lg font-semibold">BuildStream</h1>
                <p className="text-xs text-muted-foreground">{teamName}</p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut size={15} />
            </Button>
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-lg border bg-background p-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {viewerInitial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{viewer?.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                @{viewer?.githubLogin} · {role}
              </p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {filters.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant={filter === item.value ? "secondary" : "ghost"}
                className="w-full justify-start"
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </nav>

          <Separator className="my-6" />

          {canManageTeam ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bot size={16} />
                Agent API
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs leading-5 text-muted-foreground">
                Create a scoped bearer token for local agents. Raw tokens are shown once.
              </p>
              <Button type="button" className="w-full" onClick={createAgentToken}>
                Create token
              </Button>
              {agentToken ? (
                <div className="space-y-2 rounded-lg bg-muted p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">Agent curl</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={copyAgentCurl}
                    >
                      <Copy size={12} />
                      {copiedAgentCurl ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.68rem] leading-5 text-muted-foreground">
                    {agentCurl}
                  </pre>
                  <p className="text-[0.68rem] leading-4 text-muted-foreground">
                    Store this token now. It cannot be shown again.
                  </p>
                </div>
              ) : null}
              {agentTokens?.length ? (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-medium">Tokens</p>
                  {agentTokens.map((token) => (
                    <div
                      key={token.tokenId}
                      className="space-y-2 rounded-lg border bg-background p-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{token.name}</p>
                          <p className="text-[0.68rem] text-muted-foreground">
                            {token.tokenPrefix}
                            {token.revokedAt ? " · revoked" : token.lastUsedAt ? " · used" : " · unused"}
                          </p>
                        </div>
                        {!token.revokedAt ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => revokeToken(token.tokenId)}
                          >
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
          ) : null}

          {canManageTeam ? (
            <Card size="sm" className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <UserPlus size={16} />
                  Team
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <form onSubmit={submitInvite} className="space-y-2">
                  <Input
                    value={inviteLogin}
                    onChange={(event) => setInviteLogin(event.target.value)}
                    placeholder="github username"
                  />
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Select
                      value={inviteRole}
                      onValueChange={(value) => setInviteRole(value as "member" | "admin")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button disabled={!inviteLogin.trim()}>Invite</Button>
                  </div>
                </form>
                {teamAdmin ? (
                  <div className="space-y-3 border-t pt-3">
                    <div>
                      <p className="text-xs font-medium">Members</p>
                      <div className="mt-2 space-y-1">
                        {teamAdmin.members.map((member) => (
                          <div
                            key={member.membershipId}
                            className="flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="truncate">
                              {member.githubLogin ? `@${member.githubLogin}` : member.name}
                            </span>
                            <Badge variant="secondary">{member.role}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium">Invites</p>
                      <div className="mt-2 space-y-1">
                        {teamAdmin.invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt)
                          .length ? (
                          teamAdmin.invites
                            .filter((invite) => !invite.acceptedAt && !invite.revokedAt)
                            .map((invite) => (
                              <div
                                key={invite.inviteId}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <span className="truncate">@{invite.githubLogin}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => revokeInvite(invite.inviteId)}
                                >
                                  Revoke
                                </Button>
                              </div>
                            ))
                        ) : (
                          <p className="text-xs text-muted-foreground">No pending invites.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </aside>

        <section className="min-w-0 border-b px-4 py-5 lg:border-b-0 lg:border-r lg:px-6">
          <div className="mx-auto w-full max-w-2xl">
            <Card className="overflow-visible">
              <CardContent>
                <form onSubmit={submitCard} className="space-y-4">
                  <div className="flex gap-3">
                    <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                      {viewerInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Textarea
                        value={summary}
                        onChange={(event) => setSummary(event.target.value)}
                        placeholder="What should the team know? Drop a PR link here for Review."
                        className="min-h-24 resize-none bg-muted/40 px-4 py-3 text-lg shadow-none focus-visible:ring-1 md:text-lg"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {cardTypes.map((cardType) => {
                      const meta = cardMeta[cardType];
                      const Icon = meta.icon;
                      const selected = type === cardType;
                      return (
                        <button
                          key={cardType}
                          type="button"
                          onClick={() => setType(cardType)}
                          className={cn(
                            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
                            selected
                              ? meta.badgeClassName
                              : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <Icon size={13} />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>

                  {type === "production" ? (
                    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 md:grid-cols-2">
                      <Select
                        value={productionStatus}
                        onValueChange={(value) => setProductionStatus(value as ProductionStatus)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(productionStatusLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={severity} onValueChange={(value) => setSeverity(value as Severity)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(severityLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        value={workaround}
                        onChange={(event) => setWorkaround(event.target.value)}
                        placeholder="Current workaround optional"
                        className="min-h-16 resize-none md:col-span-2"
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-3 border-t pt-3 md:flex-row md:items-center md:justify-between">
                    <p
                      className={cn(
                        "text-sm text-muted-foreground",
                        needsReviewLink && "text-destructive",
                      )}
                    >
                      {type === "reviewable"
                        ? extractedPrUrl
                          ? `Detected PR: ${extractedPrUrl}`
                          : "Review posts need a GitHub, GitLab, or Bitbucket PR link."
                        : type === "production"
                          ? "Active production issues stay pinned until resolved."
                          : "Links can be pasted directly into the post."}
                    </p>
                    <Button disabled={!canPost} className="md:min-w-24">
                      <Send size={16} />
                      Post
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {error ? (
              <div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <ScrollArea className="mt-5 h-[calc(100vh-15rem)] pr-3">
              <div className="space-y-3">
                {!cards ? (
                  <Card>
                    <CardContent className="text-sm text-muted-foreground">
                      Loading stream...
                    </CardContent>
                  </Card>
                ) : cards.length === 0 ? (
                  <Card>
                    <CardContent className="py-6 text-center">
                      <p className="font-medium">No cards yet.</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Post a risk, ask, or review to start the stream.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {activeProductionCards.length ? (
                      <section className="space-y-2">
                        <div className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          <Flame size={13} />
                          Active production
                        </div>
                        {activeProductionCards.map((card) => (
                          <StreamCard
                            key={card._id}
                            card={card}
                            selected={selectedCard?._id === card._id}
                            onSelect={() => setSelectedCardId(card._id)}
                          />
                        ))}
                      </section>
                    ) : null}
                    {feedCards.map((card) => (
                      <StreamCard
                        key={card._id}
                        card={card}
                        selected={selectedCard?._id === card._id}
                        onSelect={() => setSelectedCardId(card._id)}
                      />
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </section>

        <aside className="bg-sidebar px-4 py-5 lg:px-5">
          {selectedCard ? (
            <ScrollArea className="h-[calc(100vh-2.5rem)] pr-3">
              <div className="space-y-4">
                <Card>
                  <CardContent>
                    <CardHeaderRow type={selectedCard.type} status={selectedCard.status} />
                    <h2 className="mt-3 text-xl font-semibold leading-7">
                      {selectedCard.summary}
                    </h2>
                    {selectedCard.body ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {selectedCard.body}
                      </p>
                    ) : null}
                    <ProductionDetails
                      key={selectedCard._id}
                      card={selectedCard}
                      onChange={updateSelectedProductionCard}
                    />
                    <dl className="mt-4 space-y-2 text-sm">
                      {selectedCard.branch ? (
                        <div>
                          <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                            Branch
                          </dt>
                          <dd className="mt-1 break-all font-medium">{selectedCard.branch}</dd>
                        </div>
                      ) : null}
                      {selectedCard.prUrl ? (
                        <div>
                          <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                            PR
                          </dt>
                          <dd className="mt-1 break-all">
                            <a className="font-medium text-primary underline" href={selectedCard.prUrl}>
                              {selectedCard.prUrl}
                            </a>
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    {selectedCard.type !== "production" ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-4 w-full"
                        onClick={toggleSelectedStatus}
                      >
                        <CheckCircle2 size={16} />
                        {selectedCard.status === "open"
                          ? selectedCard.type === "reviewable"
                            ? "Mark reviewed"
                            : "Mark resolved"
                          : "Reopen"}
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <h3 className="text-sm font-semibold">Thread</h3>
                    <div className="mt-3 space-y-3">
                      {!comments ? (
                        <p className="text-sm text-muted-foreground">Loading comments...</p>
                      ) : comments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No comments yet.</p>
                      ) : (
                        comments.map((item) => (
                          <div key={item._id} className="rounded-lg bg-muted p-3">
                            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {item.createdByName}
                              </span>
                              <span>{formatTime(item.createdAt)}</span>
                            </div>
                            <p className="mt-2 text-sm leading-5">{item.body}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <form onSubmit={submitComment} className="mt-4 space-y-2">
                      <Textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        placeholder="Reply with review context..."
                        className="min-h-24"
                      />
                      <Button className="w-full">Add comment</Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          ) : (
            <Card>
              <CardContent className="text-sm text-muted-foreground">
                Select a card to inspect the thread and context.
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}

function SignInScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GitBranch size={19} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">BuildStream</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with GitHub to enter your team stream.
            </p>
          </div>
          <Button type="button" className="w-full" onClick={() => signIn("github")}>
            Sign in with GitHub
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function AccessDeniedScreen({ viewer }: { viewer: Workspace["viewer"] }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 text-center">
          <Badge variant="secondary" className="mx-auto">
            @{viewer.githubLogin}
          </Badge>
          <div>
            <h1 className="text-xl font-semibold">Invite required</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask a BuildStream owner or admin to invite your GitHub username.
            </p>
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={() => signOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function CenteredState({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <Card className="w-full max-w-sm">
        <CardContent>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        </CardContent>
      </Card>
    </main>
  );
}

function StreamCard({
  card,
  selected,
  onSelect,
}: {
  card: {
    _id: Id<"cards">;
    type: CardType;
    status: "open" | "resolved";
    summary: string;
    body?: string;
    branch?: string;
    createdByName: string;
    createdAt: number;
    commentCount: number;
    productionStatus?: ProductionStatus;
    severity?: Severity;
    workaround?: string;
  };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="block w-full rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card
        className={cn(
          "border transition hover:bg-muted/20 hover:ring-foreground/10",
          selected ? "border-primary/40 bg-muted/30 ring-0" : "border-transparent",
        )}
      >
        <CardContent>
          <CardHeaderRow type={card.type} status={card.status} />
          <ProductionSummary card={card} />
          <p className="mt-3 text-base font-semibold leading-6">{card.summary}</p>
          {card.body ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {card.body}
            </p>
          ) : null}
          {card.workaround ? (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-2 text-sm">
              <span className="font-medium">Workaround:</span> {card.workaround}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{card.createdByName}</span>
            <span>{formatTime(card.createdAt)}</span>
            {card.branch ? <span>{card.branch}</span> : null}
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={13} />
              {card.commentCount}
            </span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function ProductionSummary({
  card,
}: {
  card: {
    type: CardType;
    productionStatus?: ProductionStatus;
    severity?: Severity;
  };
}) {
  if (card.type !== "production") return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Badge variant="secondary">
        {productionStatusLabels[card.productionStatus ?? "investigating"]}
      </Badge>
      {card.severity ? <Badge variant="destructive">{severityLabels[card.severity]}</Badge> : null}
    </div>
  );
}

function ProductionDetails({
  card,
  onChange,
}: {
  card: {
    type: CardType;
    productionStatus?: ProductionStatus;
    severity?: Severity;
    workaround?: string;
  };
  onChange: (next: {
    productionStatus?: ProductionStatus;
    severity?: Severity;
    workaround?: string;
  }) => void;
}) {
  const [draftWorkaround, setDraftWorkaround] = useState(card.workaround ?? "");

  if (card.type !== "production") return null;

  const currentStatus = card.productionStatus ?? "investigating";
  const currentSeverity = card.severity ?? "none";

  return (
    <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Select
          value={currentStatus}
          onValueChange={(value) => onChange({ productionStatus: value as ProductionStatus })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(productionStatusLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={currentSeverity}
          onValueChange={(value) => onChange({ severity: value as Severity })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(severityLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Textarea
        value={draftWorkaround}
        onChange={(event) => setDraftWorkaround(event.target.value)}
        placeholder="Current workaround"
        className="min-h-20"
      />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => onChange({ workaround: draftWorkaround })}
      >
        Save workaround
      </Button>
    </div>
  );
}

function CardHeaderRow({
  type,
  status,
}: {
  type: CardType;
  status: "open" | "resolved";
}) {
  const meta = cardMeta[type];
  const Icon = meta.icon;
  const statusLabel =
    status === "open" ? "open" : type === "reviewable" ? "reviewed" : "resolved";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Badge variant="outline" className={cn("gap-1.5", meta.badgeClassName)}>
        <Icon size={14} />
        {meta.label}
      </Badge>
      <Badge variant="secondary">{statusLabel}</Badge>
    </div>
  );
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function extractPrUrl(text: string) {
  const urls = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  const prUrl = urls.find((url) =>
    /\/(pull|pull-requests)\/\d+/i.test(url) || /\/-\/merge_requests\/\d+/i.test(url),
  );

  return prUrl?.replace(/[.,;:!?]+$/, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
