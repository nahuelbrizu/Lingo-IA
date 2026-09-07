// app/api/auth/[...nextauth]/route.ts
import NextAuth, { AuthOptions, SessionStrategy } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import { Session } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

// ... (imports remain the same)

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      profile(profile: any) {
        return {
          id: profile.sub, // Usar 'sub' de Google como ID
          name: profile.name,
          email: profile.email,
          image: profile.picture,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt' as SessionStrategy,
  },
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: any }) {
      // After sign-in, user object is available.
      // We are creating a separate, short-lived JWT for WebSocket authentication.
      if (user) {
        token.id = user.id;
        const wsToken = jwt.sign({ id: user.id }, process.env.NEXTAUTH_SECRET!, {
          expiresIn: '1h', // Or a duration suitable for your sessions
        });
        token.wsToken = wsToken;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      // The token object now contains the wsToken.
      // We add the user ID and the wsToken to the session object.
      if (session.user) {
        session.user.id = token.id as string;
      }
      (session as any).wsToken = token.wsToken; // Add wsToken to the session
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
