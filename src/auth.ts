import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

type GitHubProfile = {
  login?: string;
  avatar_url?: string;
};

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  providers: [
    GitHubProvider({
      clientId: process.env.AUTH_GITHUB_ID ?? "",
      clientSecret: process.env.AUTH_GITHUB_SECRET ?? "",
    }),
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        const githubProfile = profile as GitHubProfile;
        token.githubLogin = githubProfile.login;
        token.picture = githubProfile.avatar_url ?? token.picture;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.githubLogin =
          typeof token.githubLogin === "string" ? token.githubLogin : undefined;
      }
      return session;
    },
  },
};
