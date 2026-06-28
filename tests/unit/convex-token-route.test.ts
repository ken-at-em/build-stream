import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, exportPKCS8, generateKeyPair, importJWK, jwtVerify } from "jose";
import { getServerSession } from "next-auth";

import { getPublicJwk } from "@/lib/convex-auth-token";
import { GET } from "@/app/api/auth/convex-token/route";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

const originalEnv = { ...process.env };
const mockedGetServerSession = vi.mocked(getServerSession);

describe("/api/auth/convex-token", () => {
  beforeEach(async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    process.env.CONVEX_JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
    process.env.CONVEX_JWT_PUBLIC_JWK = JSON.stringify(await exportJWK(publicKey));
    process.env.NEXTAUTH_URL = "https://build-stream.test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 without a complete session", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not authenticated." });
  });

  it("returns a signed Convex JWT for a GitHub session", async () => {
    mockedGetServerSession.mockResolvedValue({
      user: {
        id: "test-user-1",
        githubLogin: "ken-at-em",
        name: "Test User",
        email: "test@buildstream.local",
        image: "https://build-stream.test/avatar.png",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    const response = await GET();
    const payload = (await response.json()) as { token: string };
    const publicKey = await importJWK(getPublicJwk(), "ES256");
    const verified = await jwtVerify(payload.token, publicKey, {
      issuer: "https://build-stream.test",
      audience: "buildstream-convex",
    });

    expect(response.status).toBe(200);
    expect(verified.payload.sub).toBe("test-user-1");
    expect(verified.payload.githubLogin).toBe("ken-at-em");
  });

  it("returns a generic configuration error when JWT env is missing", async () => {
    mockedGetServerSession.mockResolvedValue({
      user: {
        id: "test-user-1",
        githubLogin: "ken-at-em",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
    delete process.env.CONVEX_JWT_PRIVATE_KEY;

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Convex auth token is not configured.",
    });
  });
});
