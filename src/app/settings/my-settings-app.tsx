"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bot, Copy, Settings } from "lucide-react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useAppWorkspace } from "../app-shell";

export function MySettingsApp() {
  const { teamId, teamName, workspaceError } = useAppWorkspace();
  const [tokenName, setTokenName] = useState("My local agent");
  const [agentToken, setAgentToken] = useState<string | null>(null);
  const [copiedAgentCurl, setCopiedAgentCurl] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revokeMyAgentToken = useMutation(api.cards.revokeMyAgentToken);
  const myAgentTokens = useQuery(
    api.cards.listMyAgentTokens,
    teamId ? { teamId } : "skip",
  );

  const agentCurl = useMemo(() => {
    if (!agentToken) return "";
    const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
    return `curl -X POST ${origin}/api/agent/cards \\
  -H "Authorization: Bearer ${agentToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"risk","summary":"Migration touches trigger behavior; need review."}'`;
  }, [agentToken]);

  const visibleError = error ?? workspaceError;

  async function createAgentToken() {
    if (!teamId) return;
    setError(null);
    try {
      const response = await fetch("/api/agent/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          name: tokenName,
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
      await revokeMyAgentToken({
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
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 md:px-6">
      <header className="border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Settings size={18} />
          </div>
          <div>
            <h1 className="text-xl font-semibold">My Settings</h1>
            <p className="text-sm text-muted-foreground">{teamName}</p>
          </div>
        </div>
      </header>

      {visibleError ? (
        <div className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {visibleError}
        </div>
      ) : null}

      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot size={17} />
            My Agent Tokens
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              placeholder="token name"
            />
            <Button type="button" onClick={createAgentToken}>
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

          {!myAgentTokens ? (
            <p className="text-sm text-muted-foreground">Loading tokens...</p>
          ) : myAgentTokens.length ? (
            <div className="space-y-2">
              {myAgentTokens.map((token) => (
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
            <p className="text-sm text-muted-foreground">No personal agent tokens yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
