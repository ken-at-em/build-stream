import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id: string;
      githubLogin?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubLogin?: string;
  }
}
