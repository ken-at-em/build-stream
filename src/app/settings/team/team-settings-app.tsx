"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bot, Settings, UserPlus, Users } from "lucide-react";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
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
import { useAppWorkspace } from "../../app-shell";

export function TeamSettingsApp() {
  const { teamId, teamName, canManageTeam, workspaceError } = useAppWorkspace();
  const [inviteLogin, setInviteLogin] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
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

  if (!canManageTeam) {
    return <AdminAccessRequired />;
  }

  const visibleError = error ?? workspaceError;
  const pendingInvites =
    teamAdmin?.invites.filter((invite) => !invite.acceptedAt && !invite.revokedAt) ?? [];

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

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 md:px-6">
      <header className="border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Settings size={18} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Team Settings</h1>
            <p className="text-sm text-muted-foreground">{teamName}</p>
          </div>
        </div>
      </header>

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
                Service Tokens
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">
                Shared service tokens are legacy team-wide credentials. Personal agent tokens now
                live in My Settings.
              </p>

              {!agentTokens ? (
                <p className="text-sm text-muted-foreground">Loading service tokens...</p>
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
                <p className="text-sm text-muted-foreground">No service tokens.</p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function AdminAccessRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4">
          <div>
            <h1 className="text-lg font-semibold">Admin access required</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Team Settings is available to BuildStream owners and admins.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
