import { prisma } from './prisma';

export async function getUserData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { analytics: true, lessons: true },
  });
  return user;
}
