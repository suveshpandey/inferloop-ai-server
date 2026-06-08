import { prisma } from '../db/client.js';

async function main() {
    const user = await prisma.user.findFirst({
        where:  { email: { contains: process.argv[2] ?? 'ratelimit-test3' } },
        orderBy: { createdAt: 'desc' },
    });
    console.log('user', user?.id, user?.email);
    if (user) {
        const buckets = await prisma.rateLimitBucket.findMany({
            where: { id: { contains: user.id } },
        });
        console.log('buckets', JSON.stringify(buckets, null, 2));
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
