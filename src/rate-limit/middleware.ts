import type { Request, Response, NextFunction } from 'express';
import { policiesFor, type RateLimitAction } from './policies.js';
import { reserveMinuteQuota, reserveDayQuota } from './store.js';
import { sendRateLimitResponse } from './responses.js';

async function applyPolicies(
    res: Response,
    subject: string,
    action: RateLimitAction,
): Promise<boolean> {
    const policies = policiesFor(action);
    if (policies.length === 0) return true;

    for (const policy of policies) {
        const result = policy.window === 'minute'
            ? await reserveMinuteQuota(subject, action, policy.max)
            : await reserveDayQuota(subject, action, policy.max);

        if (!result.allowed) {
            sendRateLimitResponse(res, {
                action,
                window:       policy.window,
                limit:        policy.max,
                count:        result.count,
                retryAfterMs: result.retryAfterMs,
            });
            return false;
        }
    }

    return true;
}

export function createRateLimiter(action: RateLimitAction) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (await applyPolicies(res, userId, action)) next();
    };
}

function clientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0]!.trim();
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
        return forwarded[0].split(',')[0]!.trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}

/** Per-IP rate limiter for unauthenticated auth routes (login, signup). */
export function createIpRateLimiter(action: Extract<RateLimitAction, 'login' | 'signup'>) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const subject = `ip:${clientIp(req)}`;
        if (await applyPolicies(res, subject, action)) next();
    };
}
