// lib/db.ts
import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const prisma = new PrismaClient();

export async function getUserData() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user || !session.user.id) {
    // En una app real, podrías redirigir a la página de login
    throw new Error("Not authenticated.");
  }

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      analytics: true,
      lessons: {
        orderBy: { date: 'desc' },
        take: 5,
      },
    },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  return user;
}
