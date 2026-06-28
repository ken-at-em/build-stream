// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/app/app-shell";
import { useBuildStreamWorkspace, type WorkspaceState } from "@/app/workspace-state";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

vi.mock("@/app/workspace-state", () => ({
  WorkspaceGate: vi.fn(() => null),
  useBuildStreamWorkspace: vi.fn(),
}));

const mockedUseBuildStreamWorkspace = vi.mocked(useBuildStreamWorkspace);
const mockedUsePathname = vi.mocked(usePathname);
const mockedUseSearchParams = vi.mocked(useSearchParams);

const adminWorkspace: WorkspaceState = {
  session: {
    user: {
      id: "test-user-1",
      githubLogin: "ken-at-em",
      name: "Test User",
      email: "test@buildstream.local",
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  },
  workspace: {
    access: "granted",
    teamId: "teams:test" as never,
    teamName: "BuildStream Dev",
    role: "owner",
    viewer: {
      userId: "test-user-1",
      name: "Test User",
      githubLogin: "ken-at-em",
      email: "test@buildstream.local",
    },
  },
  workspaceError: null,
  sessionStatus: "authenticated",
  convexAuthLoading: false,
  convexAuthenticated: true,
  teamId: "teams:test" as never,
  teamName: "BuildStream Dev",
  viewer: {
    userId: "test-user-1",
    name: "Test User",
    githubLogin: "ken-at-em",
    email: "test@buildstream.local",
  },
  role: "owner",
  canManageTeam: true,
};

describe("app shell", () => {
  beforeEach(() => {
    mockedUseBuildStreamWorkspace.mockReturnValue(adminWorkspace);
    mockedUsePathname.mockReturnValue("/");
    mockedUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps primary navigation outside route content", () => {
    render(
      <AppShell>
        <div>Route content</div>
      </AppShell>,
    );

    expect(screen.getByText("BuildStream")).not.toBeNull();
    expect(screen.getByRole("link", { name: /stream/i }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: /my settings/i }).getAttribute("href")).toBe(
      "/settings",
    );
    expect(screen.getByRole("link", { name: /team settings/i }).getAttribute("href")).toBe(
      "/settings/team",
    );
    expect(screen.getByText("Route content")).not.toBeNull();
  });

  it("shows stream filters only on the stream route", () => {
    render(
      <AppShell>
        <div>Route content</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "All" }).getAttribute("href")).toBe("/");

    cleanup();
    mockedUsePathname.mockReturnValue("/settings");

    render(
      <AppShell>
        <div>Settings content</div>
      </AppShell>,
    );

    expect(screen.queryByRole("link", { name: "All" })).toBeNull();
    expect(screen.getByText("Settings content")).not.toBeNull();
  });
});
