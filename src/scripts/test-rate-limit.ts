// Quick harness for Postgres rate-limit buckets. Run:
//   pnpm tsx src/scripts/test-rate-limit.ts
import { reserveMinuteQuota, reserveDayQuota, cleanupExpiredBuckets } from '../rate-limit/store.js';
import { env } from '../config/env.js';

async function main() {
    const userId = `test-${Date.now()}`;
    const action = 'review';

    console.log('=== minute window (max 2) ===');
    for (let i = 1; i <= 3; i++) {
        const r = await reserveMinuteQuota(userId, action, 2);
        console.log(`  hit ${i}: allowed=${r.allowed} count=${r.count}`);
        if (i === 3 && r.allowed) throw new Error('expected 3rd minute hit to be denied');
        if (i === 3 && !r.allowed) console.log('  ✓ 3rd hit correctly denied');
    }

    console.log('=== day window (max 5) ===');
    const dayUser = `test-day-${Date.now()}`;
    for (let i = 1; i <= 6; i++) {
        const r = await reserveDayQuota(dayUser, action, 5);
        console.log(`  hit ${i}: allowed=${r.allowed} count=${r.count}`);
        if (i === 6 && r.allowed) throw new Error('expected 6th day hit to be denied');
        if (i === 6 && !r.allowed) console.log('  ✓ 6th hit correctly denied');
    }

    const cleaned = await cleanupExpiredBuckets();
    console.log(`=== cleanup: removed ${cleaned} expired bucket(s) ===`);
    console.log('env defaults:', {
        RATE_LIMIT_REVIEW_PER_MIN:  env.RATE_LIMIT_REVIEW_PER_MIN,
        RATE_LIMIT_REVIEW_PER_DAY:  env.RATE_LIMIT_REVIEW_PER_DAY,
        RATE_LIMIT_EXECUTE_PER_MIN: env.RATE_LIMIT_EXECUTE_PER_MIN,
        RATE_LIMIT_EXECUTE_PER_DAY: env.RATE_LIMIT_EXECUTE_PER_DAY,
        RATE_LIMIT_LOGIN_PER_MIN:   env.RATE_LIMIT_LOGIN_PER_MIN,
        RATE_LIMIT_SIGNUP_PER_MIN:  env.RATE_LIMIT_SIGNUP_PER_MIN,
        LLM_PROVIDER:               env.LLM_PROVIDER,
    });
    console.log('all checks passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
