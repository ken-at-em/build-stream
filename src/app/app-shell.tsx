"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, ReactNode, useContext } from "react";
import { signOut } from "next-auth/react";
import { GitBranch, LogOut, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useBuildStreamWorkspace, WorkspaceGate, type WorkspaceState } from "./workspace-state";

const AppWorkspaceContext = createContext<WorkspaceState | null>(null);

const streamFilters = [
  { value: "all", label: "All", href: "/" },
  { value: "risk", label: "Risks", href: "/?filter=risk" },
  { value: "question", label: "Questions", href: "/?filter=question" },
  { value: "reviewable", label: "Reviews", href: "/?filter=reviewable" },
  { value: "production", label: "Production", href: "/?filter=production" },
  { value: "resolved", label: "Resolved", href: "/?filter=resolved" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const workspaceState = useBuildStreamWorkspace();
  const gate = WorkspaceGate({ state: workspaceState });
  if (gate) return gate;

  return (
    <AppWorkspaceContext.Provider value={workspaceState}>
      <ShellFrame state={workspaceState}>{children}</ShellFrame>
    </AppWorkspaceContext.Provider>
  );
}

export function useAppWorkspace() {
  const state = useContext(AppWorkspaceContext);
  if (!state) {
    throw new Error("useAppWorkspace must be used inside AppShell.");
  }
  return state;
}

function ShellFrame({
  children,
  state,
}: {
  children: ReactNode;
  state: WorkspaceState;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentFilter = pathname === "/" ? searchParams.get("filter") ?? "all" : "all";
  const viewerInitial = (state.viewer?.name ?? state.session?.user?.name ?? "U")
    .charAt(0)
    .toUpperCase();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b bg-sidebar px-5 py-5 text-sidebar-foreground lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <GitBranch size={18} />
              </div>
              <div>
                <h1 className="text-lg font-semibold">BuildStream</h1>
                <p className="text-xs text-muted-foreground">{state.teamName}</p>
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
              <p className="truncate text-sm font-medium">{state.viewer?.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                @{state.viewer?.githubLogin} · {state.role}
              </p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            <ShellLink href="/" active={pathname === "/"}>
              <GitBranch size={16} />
              Stream
            </ShellLink>
            <ShellLink href="/settings" active={pathname === "/settings"}>
              <Settings size={16} />
              My Settings
            </ShellLink>
            {state.canManageTeam ? (
              <ShellLink href="/settings/team" active={pathname === "/settings/team"}>
                <Settings size={16} />
                Team Settings
              </ShellLink>
            ) : null}
          </nav>

          {pathname === "/" ? (
            <>
              <Separator className="my-6" />
              <nav className="space-y-1">
                {streamFilters.map((item) => (
                  <Button
                    key={item.value}
                    asChild
                    variant={currentFilter === item.value ? "secondary" : "ghost"}
                    className="w-full justify-start"
                  >
                    <Link href={item.href}>{item.label}</Link>
                  </Button>
                ))}
              </nav>
            </>
          ) : null}
        </aside>

        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}

function ShellLink({
  active,
  children,
  href,
}: {
  active: boolean;
  children: ReactNode;
  href: string;
}) {
  return (
    <Button
      asChild
      variant={active ? "secondary" : "ghost"}
      className={cn("w-full justify-start", active && "font-semibold")}
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}
