// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  const demoUser = await prisma.user.create({
    data: {
      id: 'a4b8f0b0-5c6a-4f2d-8e1c-7a9b0d1f2e3d',
      name: 'Nahue',
      email: 'demo@example.com', // Email is required by the default schema
      languageLevel: 'B1',
      analytics: {
        create: {
          commonMistakes: ["Pronunciación de la 'rr'"],
          masteredTopics: ['Presente Simple'],
        },
      },
    },
  });

  console.log(`✅ Created user: ${demoUser.name} (ID: ${demoUser.id})`);
  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
