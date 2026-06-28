"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  const client = useMemo(() => {
    if (!convexUrl) return null;
    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);

  if (!client) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f5ef] px-6 text-[#20201d]">
        <section className="w-full max-w-xl rounded-lg border border-[#d8d2c4] bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7d6b47]">
            BuildStream setup
          </p>
          <h1 className="mt-3 text-2xl font-semibold">Convex is not configured yet.</h1>
          <p className="mt-3 text-sm leading-6 text-[#5b5b55]">
            Run <code className="rounded bg-[#eee8da] px-1.5 py-0.5">npx convex dev</code>{" "}
            and make sure <code className="rounded bg-[#eee8da] px-1.5 py-0.5">NEXT_PUBLIC_CONVEX_URL</code>{" "}
            is present in <code className="rounded bg-[#eee8da] px-1.5 py-0.5">.env.local</code>.
          </p>
        </section>
      </main>
    );
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
