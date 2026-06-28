import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportJWK, exportPKCS8, generateKeyPair, importJWK, jwtVerify } from "jose";

import { convexJwtAudience, getPublicJwk, signConvexJwt } from "@/lib/convex-auth-token";

const originalEnv = { ...process.env };

describe("Convex JWT helpers", () => {
  beforeEach(async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const publicJwk = await exportJWK(publicKey);
    process.env.CONVEX_JWT_PRIVATE_KEY = await exportPKCS8(privateKey);
    process.env.CONVEX_JWT_PUBLIC_JWK = JSON.stringify(publicJwk);
    process.env.NEXTAUTH_URL = "https://build-stream.test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("applies public JWK defaults", () => {
    const publicJwk = getPublicJwk();

    expect(publicJwk.kid).toBe("buildstream-convex-key");
    expect(publicJwk.use).toBe("sig");
    expect(publicJwk.alg).toBe("ES256");
  });

  it("signs a JWT Convex can verify with the configured issuer and audience", async () => {
    const token = await signConvexJwt({
      subject: "test-user-1",
      name: "Test User",
      email: "test@buildstream.local",
      picture: "https://build-stream.test/avatar.png",
      githubLogin: "ken-at-em",
    });

    const publicKey = await importJWK(getPublicJwk(), "ES256");
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      issuer: "https://build-stream.test",
      audience: convexJwtAudience,
    });

    expect(protectedHeader.alg).toBe("ES256");
    expect(protectedHeader.kid).toBe("buildstream-convex-key");
    expect(payload.sub).toBe("test-user-1");
    expect(payload.githubLogin).toBe("ken-at-em");
    expect(payload.exp! - payload.iat!).toBe(300);
  });

  it("fails clearly when JWT key env is missing", async () => {
    delete process.env.CONVEX_JWT_PRIVATE_KEY;

    await expect(signConvexJwt({ subject: "test-user-1" })).rejects.toThrow(
      "CONVEX_JWT_PRIVATE_KEY is required.",
    );
  });
});
