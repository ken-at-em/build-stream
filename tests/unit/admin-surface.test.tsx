// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { useMutation, useQuery } from "convex/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BuildStreamApp } from "@/app/stream-app";
import { MySettingsApp } from "@/app/settings/my-settings-app";
import { TeamSettingsApp } from "@/app/settings/team/team-settings-app";
import { useAppWorkspace } from "@/app/app-shell";
import type { WorkspaceState } from "@/app/workspace-state";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("@/app/app-shell", () => ({
  useAppWorkspace: vi.fn(),
}));

const mockedUseAppWorkspace = vi.mocked(useAppWorkspace);
const mockedUseQuery = vi.mocked(useQuery);
const mockedUseMutation = vi.mocked(useMutation);

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

describe("admin surfaces", () => {
  beforeEach(() => {
    mockedUseMutation.mockReturnValue(vi.fn());
    mockedUseAppWorkspace.mockReturnValue(adminWorkspace);
    mockedUseQuery.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps invite and token management out of the stream", () => {
    mockedUseQuery
      .mockReturnValueOnce([])
      .mockReturnValueOnce(undefined);

    render(<BuildStreamApp />);

    expect(screen.queryByText("Agent API")).toBeNull();
    expect(screen.queryByPlaceholderText("github username")).toBeNull();
    expect(screen.queryByRole("button", { name: "Create token" })).toBeNull();
  });

  it("shows personal agent tokens on My Settings for any member", () => {
    mockedUseAppWorkspace.mockReturnValue({
      ...adminWorkspace,
      role: "member",
      canManageTeam: false,
      workspace: {
        access: "granted",
        teamId: "teams:test" as never,
        teamName: "BuildStream Dev",
        role: "member",
        viewer: {
          userId: "test-user-1",
          name: "Test User",
          githubLogin: "ken-at-em",
          email: "test@buildstream.local",
        },
      },
    });
    mockedUseQuery.mockReturnValueOnce([]);

    render(<MySettingsApp />);

    expect(screen.getByRole("heading", { name: "My Settings" })).not.toBeNull();
    expect(screen.getByText("My Agent Tokens")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Create token" })).not.toBeNull();
  });

  it("shows team admin controls on the team settings page for admins", () => {
    mockedUseQuery
      .mockReturnValueOnce({
        members: [
          {
            membershipId: "teamMembers:test",
            userId: "test-user-1",
            name: "Test User",
            githubLogin: "ken-at-em",
            role: "owner",
            createdAt: Date.now(),
          },
        ],
        invites: [
          {
            inviteId: "teamInvites:test",
            githubLogin: "future-dev",
            role: "member",
            createdAt: Date.now(),
          },
        ],
      })
      .mockReturnValueOnce([]);

    render(<TeamSettingsApp />);

    expect(screen.getByRole("heading", { name: "Team Settings" })).not.toBeNull();
    expect(screen.getByText("@ken-at-em")).not.toBeNull();
    expect(screen.getByText("@future-dev")).not.toBeNull();
    expect(screen.getByPlaceholderText("github username")).not.toBeNull();
    expect(screen.getByText("Service Tokens")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Create token" })).toBeNull();
  });

  it("blocks team settings controls for non-admin members", () => {
    mockedUseAppWorkspace.mockReturnValue({
      ...adminWorkspace,
      role: "member",
      canManageTeam: false,
      workspace: {
        access: "granted",
        teamId: "teams:test" as never,
        teamName: "BuildStream Dev",
        role: "member",
        viewer: {
          userId: "test-user-1",
          name: "Test User",
          githubLogin: "ken-at-em",
          email: "test@buildstream.local",
        },
      },
    });
    mockedUseQuery.mockReturnValue(undefined);

    render(<TeamSettingsApp />);

    expect(screen.getByText("Admin access required")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Create token" })).toBeNull();
  });
});
