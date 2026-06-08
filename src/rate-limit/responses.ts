import type { Response } from 'express';
import type { RateLimitAction } from './policies.js';
import type { WindowKind } from './policies.js';

export type RateLimitCode =
    | 'RATE_LIMIT_MINUTE'
    | 'RATE_LIMIT_DAILY'
    | 'RATE_LIMIT_EXECUTE_MINUTE'
    | 'RATE_LIMIT_EXECUTE_DAILY'
    | 'RATE_LIMIT_AUTH_LOGIN'
    | 'RATE_LIMIT_AUTH_SIGNUP';

function codeFor(action: RateLimitAction, window: WindowKind): RateLimitCode {
    if (action === 'login')  return 'RATE_LIMIT_AUTH_LOGIN';
    if (action === 'signup') return 'RATE_LIMIT_AUTH_SIGNUP';
    if (action === 'review') {
        return window === 'minute' ? 'RATE_LIMIT_MINUTE' : 'RATE_LIMIT_DAILY';
    }
    return window === 'minute' ? 'RATE_LIMIT_EXECUTE_MINUTE' : 'RATE_LIMIT_EXECUTE_DAILY';
}

function messageFor(action: RateLimitAction, window: WindowKind, limit: number): string {
    if (action === 'login') {
        return 'Too many login attempts. Please wait a moment before trying again.';
    }
    if (action === 'signup') {
        return 'Too many sign-up attempts. Please wait a moment before trying again.';
    }
    if (action === 'review') {
        if (window === 'minute') {
            return 'Too many reviews. Please wait a moment before starting another.';
        }
        return `Daily review limit reached (${limit} per day). Try again later.`;
    }
    if (window === 'minute') {
        return 'Too many test runs. Please wait before running tests again.';
    }
    return 'Daily test run limit reached. Try again later.';
}

export function sendRateLimitResponse(
    res: Response,
    opts: {
        action:       RateLimitAction;
        window:       WindowKind;
        limit:        number;
        count:        number;
        retryAfterMs: number;
    },
): void {
    const retryAfterSec = Math.max(1, Math.ceil(opts.retryAfterMs / 1000));
    const remaining = Math.max(0, opts.limit - opts.count);

    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({
        error:      messageFor(opts.action, opts.window, opts.limit),
        code:       codeFor(opts.action, opts.window),
        limit:      opts.limit,
        remaining,
        retryAfter: retryAfterSec,
    });
}
