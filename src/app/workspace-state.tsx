"use client";

import { useEffect, useState } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { signIn, signOut, useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { GitBranch } from "lucide-react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type TeamRole = "owner" | "admin" | "member";

export type WorkspaceViewer = {
  userId: string;
  name: string;
  githubLogin: string;
  email?: string;
  avatarUrl?: string;
};

export type Workspace =
  | {
      access: "granted";
      teamId: Id<"teams">;
      teamName: string;
      role: TeamRole;
      viewer: WorkspaceViewer;
    }
  | {
      access: "denied";
      viewer: WorkspaceViewer;
    };

export type WorkspaceState = {
  session: Session | null;
  workspace: Workspace | null;
  workspaceError: string | null;
  sessionStatus: "authenticated" | "loading" | "unauthenticated";
  convexAuthLoading: boolean;
  convexAuthenticated: boolean;
  teamId: Id<"teams"> | null;
  teamName: string;
  viewer?: WorkspaceViewer;
  role: TeamRole | null;
  canManageTeam: boolean;
};

export function useBuildStreamWorkspace(): WorkspaceState {
  const { data: session, status: sessionStatus } = useSession();
  const { isLoading: convexAuthLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const ensureWorkspace = useMutation(api.cards.ensureWorkspace);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !convexAuthenticated) {
      return;
    }

    let cancelled = false;
    ensureWorkspace({})
      .then((workspace) => {
        if (cancelled) return;
        setWorkspace(workspace as Workspace);
      })
      .catch((cause) => {
        if (cancelled) return;
        setWorkspaceError(errorMessage(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [convexAuthenticated, ensureWorkspace, sessionStatus]);

  const canUseConvex = sessionStatus === "authenticated" && convexAuthenticated;
  const teamId = canUseConvex && workspace?.access === "granted" ? workspace.teamId : null;
  const role = workspace?.access === "granted" ? workspace.role : null;

  return {
    session,
    workspace,
    workspaceError,
    sessionStatus,
    convexAuthLoading,
    convexAuthenticated,
    teamId,
    teamName: workspace?.access === "granted" ? workspace.teamName : "BuildStream",
    viewer: workspace?.viewer,
    role,
    canManageTeam: role === "owner" || role === "admin",
  };
}

export function WorkspaceGate({ state }: { state: WorkspaceState }) {
  if (state.sessionStatus === "loading" || state.convexAuthLoading) {
    return <CenteredState title="Loading BuildStream" body="Checking your GitHub session..." />;
  }

  if (state.sessionStatus === "unauthenticated") {
    return <SignInScreen />;
  }

  if (!state.convexAuthenticated) {
    return (
      <CenteredState
        title="Authentication unavailable"
        body="BuildStream could not establish a secure app session. Reload or sign in again."
      />
    );
  }

  if (!state.workspace) {
    return <CenteredState title="Loading workspace" body="Checking your team access..." />;
  }

  if (state.workspace.access === "denied") {
    return <AccessDeniedScreen viewer={state.workspace.viewer} />;
  }

  return null;
}

export function CenteredState({ title, body }: { title: string; body: string }) {
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

function AccessDeniedScreen({ viewer }: { viewer: WorkspaceViewer }) {
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
