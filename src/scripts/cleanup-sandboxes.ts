// Bulk-delete every sandbox under the configured Vercel team. Use this once
// to reclaim storage / rate-limit headroom after a flurry of test runs.
//
// Run: pnpm tsx src/scripts/cleanup-sandboxes.ts
//
// Going forward, the runner calls sandbox.delete() (not .stop()) so sandboxes
// don't accumulate — this script is just for cleaning up the existing pile.

import 'dotenv/config';
import { Sandbox } from '@vercel/sandbox';
import { env } from '../config/env.js';

async function main() {
    if (!env.VERCEL_TOKEN || !env.VERCEL_TEAM_ID || !env.VERCEL_PROJECT_ID) {
        throw new Error('VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID must be set in .env.');
    }

    const creds = {
        token:     env.VERCEL_TOKEN,
        teamId:    env.VERCEL_TEAM_ID,
        projectId: env.VERCEL_PROJECT_ID,
    };

    console.log('Listing sandboxes…');
    const list = await Sandbox.list(creds);

    let ok = 0, failed = 0, total = 0;
    for await (const meta of list) {
        total++;
        const label = `${meta.name} [${meta.status}]`;
        try {
            const s = await Sandbox.get({ name: meta.name, ...creds });
            await s.delete();
            ok++;
            console.log(`✓ deleted ${label}`);
        } catch (err) {
            failed++;
            console.warn(`✗ failed ${label}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\nDone. ${ok}/${total} deleted${failed ? ` (${failed} failed)` : ''}.`);
}

main().catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
});
