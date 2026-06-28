import type { AuthConfig } from "convex/server";

const issuer = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export default {
  providers: [
    {
      type: "customJwt",
      issuer,
      jwks: `${issuer}/.well-known/jwks.json`,
      algorithm: "ES256",
      applicationID: "buildstream-convex",
    },
  ],
} satisfies AuthConfig;
