const baseUrl = process.env.BUILDSTREAM_SMOKE_URL ?? "https://build-stream.vercel.app";

async function assertStatus(path, expectedStatus) {
  const response = await fetch(new URL(path, baseUrl));
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}, expected ${expectedStatus}`);
  }
  return response;
}

await assertStatus("/", 200);
await assertStatus("/api/auth/signin", 200);

const jwksResponse = await assertStatus("/.well-known/jwks.json", 200);
const jwks = await jwksResponse.json();
const key = Array.isArray(jwks.keys) ? jwks.keys[0] : undefined;
if (!key || key.alg !== "ES256") {
  throw new Error("JWKS did not expose an ES256 signing key.");
}

console.log(`Smoke passed for ${baseUrl}`);
