import { importPKCS8, importJWK, SignJWT, type JWK } from "jose";

export const convexJwtAudience = "buildstream-convex";
const defaultKeyId = "buildstream-convex-key";

export function getConvexJwtIssuer() {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export function getPublicJwk() {
  const raw = process.env.CONVEX_JWT_PUBLIC_JWK;
  if (!raw) {
    throw new Error("CONVEX_JWT_PUBLIC_JWK is required.");
  }
  const jwk = JSON.parse(raw) as JWK;
  return {
    ...jwk,
    kid: jwk.kid ?? defaultKeyId,
    use: jwk.use ?? "sig",
    alg: jwk.alg ?? "ES256",
  };
}

export async function signConvexJwt(claims: {
  subject: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  githubLogin?: string | null;
}) {
  const key = await getPrivateKey();
  const publicJwk = getPublicJwk();
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({
    name: claims.name ?? undefined,
    email: claims.email ?? undefined,
    picture: claims.picture ?? undefined,
    githubLogin: claims.githubLogin ?? undefined,
  })
    .setProtectedHeader({ alg: "ES256", kid: String(publicJwk.kid ?? defaultKeyId) })
    .setIssuer(getConvexJwtIssuer())
    .setAudience(convexJwtAudience)
    .setSubject(claims.subject)
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .sign(key);
}

async function getPrivateKey() {
  const raw = process.env.CONVEX_JWT_PRIVATE_KEY;
  if (!raw) {
    throw new Error("CONVEX_JWT_PRIVATE_KEY is required.");
  }

  const decoded = raw.trim().startsWith("\"") ? (JSON.parse(raw) as string) : raw;
  const value = decoded.replace(/\\n/g, "\n");
  if (value.trim().startsWith("{")) {
    return importJWK(JSON.parse(value) as JWK, "ES256");
  }
  return importPKCS8(value, "ES256");
}
