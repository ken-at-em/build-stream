// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useConvexAuthFromSession } from "@/app/convex-provider";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

const mockedUseSession = vi.mocked(useSession);

describe("useConvexAuthFromSession", () => {
  beforeEach(() => {
    mockedUseSession.mockReturnValue({
      status: "authenticated",
      data: {
        user: {
          id: "test-user-1",
          githubLogin: "ken-at-em",
          name: "Test User",
          email: "test@buildstream.local",
        },
        expires: new Date(Date.now() + 60_000).toISOString(),
      },
      update: vi.fn(),
    });
  });

  it("keeps the token fetcher stable across rerenders", () => {
    const { result, rerender } = renderHook(() => useConvexAuthFromSession());
    const firstFetcher = result.current.fetchAccessToken;

    rerender();

    expect(result.current.fetchAccessToken).toBe(firstFetcher);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it("maps NextAuth loading and unauthenticated states", () => {
    mockedUseSession.mockReturnValueOnce({
      status: "loading",
      data: null,
      update: vi.fn(),
    });
    const loading = renderHook(() => useConvexAuthFromSession());
    expect(loading.result.current.isLoading).toBe(true);
    expect(loading.result.current.isAuthenticated).toBe(false);
    loading.unmount();

    mockedUseSession.mockReturnValueOnce({
      status: "unauthenticated",
      data: null,
      update: vi.fn(),
    });
    const unauthenticated = renderHook(() => useConvexAuthFromSession());
    expect(unauthenticated.result.current.isLoading).toBe(false);
    expect(unauthenticated.result.current.isAuthenticated).toBe(false);
  });

  it("only calls the token endpoint when Convex asks for a token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "convex-test-token" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(() => useConvexAuthFromSession());
    rerender();
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(result.current.fetchAccessToken({ forceRefreshToken: false })).resolves.toBe(
      "convex-test-token",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/convex-token");
  });
});
