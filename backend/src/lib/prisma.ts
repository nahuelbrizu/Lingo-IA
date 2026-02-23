// lib/prisma.ts
import { PrismaClient } from '@prisma/client';

// Evita que se creen múltiples instancias de PrismaClient en el entorno de desarrollo
// debido al Hot Reloading de Next.js.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
