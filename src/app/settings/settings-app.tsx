"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bot, Copy, GitBranch, LogOut, Settings, UserPlus, Users } from "lucide-react";
import { signOut } from "next-auth/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useBuildStreamWorkspace, WorkspaceGate } from "../workspace-state";

export function SettingsApp() {
  const workspaceState = useBuildStreamWorkspace();
  const { teamId, teamName, viewer, role, canManageTeam, workspaceError } = workspaceState;
  const [inviteLogin, setInviteLogin] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [copiedAgentCurl, setCopiedAgentCurl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTeamInvite = useMutation(api.cards.createTeamInvite);
  const revokeTeamInvite = useMutation(api.cards.revokeTeamInvite);
  const revokeAgentToken = useMutation(api.cards.revokeAgentToken);

  const teamAdmin = useQuery(
    api.cards.listTeamAdmin,
    teamId && canManageTeam ? { teamId } : "skip",
  );
  const agentTokens = useQuery(
    api.cards.listAgentTokens,
    teamId && canManageTeam ? { teamId } : "skip",
  );

  const agentCurl = useMemo(() => {
    if (!agentToken) return "";
    const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
    return `curl -X POST ${origin}/api/agent/cards \\
  -H "Authorization: Bearer ${agentToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"risk","summary":"Migration touches trigger behavior; need DB review.","agentName":"Codex"}'`;
  }, [agentToken]);

  const gate = WorkspaceGate({ state: workspaceState });
  if (gate) return gate;

  if (!canManageTeam) {
    return <AdminAccessRequired />;
  }

  const visibleError = error ?? workspaceError;
  const pendingInvites =
    teamAdmin?.invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt) ?? [];
  const viewerInitial = (viewer?.name ?? "U").charAt(0).toUpperCase();

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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 md:px-6">
        <header className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Settings size={18} />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Team Settings</h1>
              <p className="text-sm text-muted-foreground">{teamName}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/">
                <GitBranch size={16} />
                Stream
              </Link>
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut size={15} />
            </Button>
          </div>
        </header>

        <div className="mt-5 flex items-center gap-3 rounded-lg border bg-card p-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {viewerInitial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{viewer?.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              @{viewer?.githubLogin} · {role}
            </p>
          </div>
        </div>

        {visibleError ? (
          <div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {visibleError}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <section className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users size={17} />
                  Members
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!teamAdmin ? (
                  <p className="text-sm text-muted-foreground">Loading members...</p>
                ) : (
                  <div className="divide-y rounded-lg border">
                    {teamAdmin.members.map((member) => (
                      <div
                        key={member.membershipId}
                        className="flex items-center justify-between gap-3 px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{member.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.githubLogin ? `@${member.githubLogin}` : "GitHub login unavailable"}
                          </p>
                        </div>
                        <Badge variant="secondary">{member.role}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus size={17} />
                  Invites
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={submitInvite} className="grid gap-2 md:grid-cols-[1fr_150px_auto]">
                  <Input
                    value={inviteLogin}
                    onChange={(event) => setInviteLogin(event.target.value)}
                    placeholder="github username"
                  />
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole(value as "member" | "admin")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button disabled={!inviteLogin.trim()}>Invite</Button>
                </form>

                <Separator />

                {!teamAdmin ? (
                  <p className="text-sm text-muted-foreground">Loading invites...</p>
                ) : pendingInvites.length ? (
                  <div className="divide-y rounded-lg border">
                    {pendingInvites.map((invite) => (
                      <div
                        key={invite.inviteId}
                        className="flex items-center justify-between gap-3 px-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">@{invite.githubLogin}</p>
                          <p className="text-xs text-muted-foreground">{invite.role}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => revokeInvite(invite.inviteId)}
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No pending invites.</p>
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot size={17} />
                  Agent Tokens
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-muted-foreground">
                    Create scoped bearer tokens for local agents. Raw tokens are shown once.
                  </p>
                  <Button type="button" className="w-full" onClick={createAgentToken}>
                    Create token
                  </Button>
                </div>

                {agentToken ? (
                  <div className="space-y-2 rounded-lg bg-muted p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">Agent curl</span>
                      <Button type="button" variant="outline" size="xs" onClick={copyAgentCurl}>
                        <Copy size={12} />
                        {copiedAgentCurl ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 font-mono text-[0.72rem] leading-5 text-muted-foreground">
                      {agentCurl}
                    </pre>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Store this token now. It cannot be shown again.
                    </p>
                  </div>
                ) : null}

                <Separator />

                {!agentTokens ? (
                  <p className="text-sm text-muted-foreground">Loading tokens...</p>
                ) : agentTokens.length ? (
                  <div className="space-y-2">
                    {agentTokens.map((token) => (
                      <div key={token.tokenId} className="rounded-lg border bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{token.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {token.tokenPrefix}
                              {token.revokedAt
                                ? " · revoked"
                                : token.lastUsedAt
                                  ? " · used"
                                  : " · unused"}
                            </p>
                          </div>
                          {!token.revokedAt ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => revokeToken(token.tokenId)}
                            >
                              Revoke
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No agent tokens yet.</p>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function AdminAccessRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold">Admin access required</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Team Settings is available to BuildStream owners and admins.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href="/">
              <GitBranch size={16} />
              Back to stream
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
