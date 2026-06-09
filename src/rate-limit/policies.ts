import { env } from '../config/env.js';

export type RateLimitAction = 'review' | 'execute_tests' | 'login' | 'signup';

export type WindowKind = 'minute' | 'day';

export type RateLimitPolicy = {
    window: WindowKind;
    max:    number;
};

export function isReviewLimitEnabled(): boolean {
    return env.LLM_PROVIDER !== 'ollama';
}

export function policiesFor(action: RateLimitAction): RateLimitPolicy[] {
    if (action === 'review') {
        if (!isReviewLimitEnabled()) return [];
        return [
            { window: 'minute', max: env.RATE_LIMIT_REVIEW_PER_MIN },
            { window: 'day',    max: env.RATE_LIMIT_REVIEW_PER_DAY },
        ];
    }

    if (action === 'execute_tests') {
        return [
            { window: 'minute', max: env.RATE_LIMIT_EXECUTE_PER_MIN },
            { window: 'day',    max: env.RATE_LIMIT_EXECUTE_PER_DAY },
        ];
    }

    if (action === 'login') {
        return [{ window: 'minute', max: env.RATE_LIMIT_LOGIN_PER_MIN }];
    }

    return [{ window: 'minute', max: env.RATE_LIMIT_SIGNUP_PER_MIN }];
}
