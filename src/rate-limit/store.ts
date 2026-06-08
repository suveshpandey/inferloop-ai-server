import { prisma } from '../db/client.js';

export type ReserveResult = {
    allowed:      boolean;
    count:        number;
    retryAfterMs: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function minuteBucketId(userId: string, action: string, now: Date): string {
    const y = now.getUTCFullYear();
    const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const h = String(now.getUTCHours()).padStart(2, '0');
    const mi = String(now.getUTCMinutes()).padStart(2, '0');
    return `${userId}:${action}:min:${y}-${mo}-${d}T${h}:${mi}`;
}

function minuteExpiresAt(now: Date): Date {
    const expires = new Date(now);
    expires.setUTCSeconds(0, 0);
    expires.setUTCMinutes(expires.getUTCMinutes() + 1);
    return expires;
}

function dayBucketId(userId: string, action: string): string {
    return `${userId}:${action}:day`;
}

/**
 * Atomically reserve one unit of quota in a bucket. Creates or resets the
 * bucket when expired, then increments count. Returns whether the new count
 * is within `max`.
 */
async function reserveInBucket(
    bucketId: string,
    max: number,
    expiresAt: Date,
    now: Date,
): Promise<ReserveResult> {
    return prisma.$transaction(async (tx) => {
        const existing = await tx.rateLimitBucket.findUnique({ where: { id: bucketId } });

        if (!existing || existing.expiresAt <= now) {
            await tx.rateLimitBucket.upsert({
                where:  { id: bucketId },
                create: { id: bucketId, count: 1, expiresAt },
                update: { count: 1, expiresAt },
            });
            return {
                allowed:      1 <= max,
                count:        1,
                retryAfterMs: Math.max(0, expiresAt.getTime() - now.getTime()),
            };
        }

        const updated = await tx.rateLimitBucket.update({
            where: { id: bucketId },
            data:  { count: { increment: 1 } },
        });

        return {
            allowed:      updated.count <= max,
            count:        updated.count,
            retryAfterMs: Math.max(0, existing.expiresAt.getTime() - now.getTime()),
        };
    });
}

/** Reserve one hit against a fixed 1-minute UTC window. */
export async function reserveMinuteQuota(
    userId: string,
    action: string,
    max: number,
): Promise<ReserveResult> {
    const now = new Date();
    const bucketId = minuteBucketId(userId, action, now);
    const expiresAt = minuteExpiresAt(now);
    return reserveInBucket(bucketId, max, expiresAt, now);
}

/** Reserve one hit against a rolling 24-hour window (from first hit in window). */
export async function reserveDayQuota(
    userId: string,
    action: string,
    max: number,
): Promise<ReserveResult> {
    const now = new Date();
    const bucketId = dayBucketId(userId, action);

    return prisma.$transaction(async (tx) => {
        const existing = await tx.rateLimitBucket.findUnique({ where: { id: bucketId } });

        if (!existing || existing.expiresAt <= now) {
            const expiresAt = new Date(now.getTime() + DAY_MS);
            await tx.rateLimitBucket.upsert({
                where:  { id: bucketId },
                create: { id: bucketId, count: 1, expiresAt },
                update: { count: 1, expiresAt },
            });
            return {
                allowed:      1 <= max,
                count:        1,
                retryAfterMs: DAY_MS,
            };
        }

        const updated = await tx.rateLimitBucket.update({
            where: { id: bucketId },
            data:  { count: { increment: 1 } },
        });

        return {
            allowed:      updated.count <= max,
            count:        updated.count,
            retryAfterMs: Math.max(0, existing.expiresAt.getTime() - now.getTime()),
        };
    });
}

/** Delete expired buckets (optional maintenance). */
export async function cleanupExpiredBuckets(): Promise<number> {
    const result = await prisma.rateLimitBucket.deleteMany({
        where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
}
