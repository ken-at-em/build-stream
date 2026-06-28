import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";

type GitHubProfile = {
  login?: string;
  avatar_url?: string;
};

const providers: NextAuthOptions["providers"] = [
  GitHubProvider({
    clientId: process.env.AUTH_GITHUB_ID ?? "",
    clientSecret: process.env.AUTH_GITHUB_SECRET ?? "",
  }),
];

if (process.env.BUILDSTREAM_TEST_AUTH === "1") {
  providers.push(
    CredentialsProvider({
      id: "buildstream-test",
      name: "BuildStream Test",
      credentials: {
        githubLogin: { label: "GitHub login", type: "text" },
      },
      async authorize() {
        return {
          id: "test-user-1",
          name: "Test User",
          email: "test@buildstream.local",
          githubLogin: "ken-at-em",
        };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  providers,
  callbacks: {
    async jwt({ token, profile, user }) {
      const testUser = user as { githubLogin?: string } | undefined;
      if (profile) {
        const githubProfile = profile as GitHubProfile;
        token.githubLogin = githubProfile.login ?? token.githubLogin;
        token.picture = githubProfile.avatar_url ?? token.picture;
      }
      token.githubLogin = testUser?.githubLogin ?? token.githubLogin;
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
