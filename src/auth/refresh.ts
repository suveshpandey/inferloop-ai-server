import crypto from 'node:crypto'
import { prisma } from '../db/client.js'
import { env } from '../config/env.js'

function hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function issueRefreshToken(userId: string): Promise<string> {
    const raw = crypto.randomBytes(48).toString('base64url');
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
        data: {
            userId, 
            tokenHash,
            expiresAt
        }
    });

    return raw;
}

export async function findValidRefreshToken(rawToken: string): Promise<string | null> {
    const tokenHash = hashToken(rawToken);
    const record = await prisma.refreshToken.findUnique({
        where: {
            tokenHash: tokenHash
        }
    })

    if (!record) return null;
    if (record.revokedAt) return null;
    if (record.expiresAt < new Date()) return null;

    return record.userId
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await prisma.refreshToken.updateMany({
        where: {
            tokenHash: tokenHash,
            revokedAt: null
        },
        data: {
            revokedAt: new Date()
        },
    });
}