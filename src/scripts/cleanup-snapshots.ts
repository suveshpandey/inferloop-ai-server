// Bulk-delete every Vercel Sandbox snapshot under the configured team EXCEPT
// the one currently referenced by VERCEL_CPP_SNAPSHOT_ID in .env (the active
// C++ toolchain snapshot used by runner.ts). Use this to reclaim snapshot
// storage after repeated runs of build-cpp-snapshot.ts left orphans behind.
//
// Run: pnpm tsx src/scripts/cleanup-snapshots.ts
//
// Safety: dry-runs by default — prints what *would* be deleted and exits.
// Pass --yes (or -y) as a second arg to actually delete.

import 'dotenv/config';
import { Snapshot } from '@vercel/sandbox';
import { env } from '../config/env.js';

async function main() {
    if (!env.VERCEL_TOKEN || !env.VERCEL_TEAM_ID || !env.VERCEL_PROJECT_ID) {
        throw new Error('VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID must be set in .env.');
    }

    const keepId  = env.VERCEL_CPP_SNAPSHOT_ID?.trim() || null;
    const confirm = process.argv.slice(2).some((a) => a === '--yes' || a === '-y');

    const creds = {
        token:     env.VERCEL_TOKEN,
        teamId:    env.VERCEL_TEAM_ID,
        projectId: env.VERCEL_PROJECT_ID,
    };

    console.log('Listing snapshots…');
    if (keepId) {
        console.log(`Will preserve VERCEL_CPP_SNAPSHOT_ID = ${keepId}`);
    } else {
        console.log('⚠ VERCEL_CPP_SNAPSHOT_ID is empty in .env — nothing will be preserved.');
    }

    const list = await Snapshot.list(creds);

    type Row = { id: string; sizeBytes: number; createdAt: number; status: string };
    const rows: Row[] = [];
    for await (const meta of list) {
        rows.push({
            id:        meta.id,
            sizeBytes: meta.sizeBytes,
            createdAt: meta.createdAt,
            status:    meta.status,
        });
    }

    if (rows.length === 0) {
        console.log('No snapshots found.');
        return;
    }

    const targets = rows.filter((r) => r.id !== keepId);
    const totalMb = (rows.reduce((s, r) => s + r.sizeBytes, 0) / 1024 / 1024).toFixed(1);
    const freeMb  = (targets.reduce((s, r) => s + r.sizeBytes, 0) / 1024 / 1024).toFixed(1);

    console.log(`\nFound ${rows.length} snapshot${rows.length === 1 ? '' : 's'} (${totalMb} MB total).`);
    console.log(`Will delete ${targets.length} (~${freeMb} MB), keep ${rows.length - targets.length}.\n`);

    for (const r of rows) {
        const kept = r.id === keepId ? '★ KEEP' : '  drop';
        const date = new Date(r.createdAt).toISOString().slice(0, 10);
        const mb   = (r.sizeBytes / 1024 / 1024).toFixed(1).padStart(6);
        console.log(`${kept}  ${r.id}  ${date}  ${mb} MB  [${r.status}]`);
    }

    if (!confirm) {
        console.log('\nDry run. Re-run with --yes to actually delete:');
        console.log('  pnpm tsx src/scripts/cleanup-snapshots.ts --yes');
        return;
    }

    console.log('\nDeleting…');
    let ok = 0, failed = 0;
    for (const r of targets) {
        try {
            const snap = await Snapshot.get({ snapshotId: r.id, ...creds });
            await snap.delete();
            ok++;
            console.log(`✓ deleted ${r.id}`);
        } catch (err) {
            failed++;
            console.warn(`✗ failed ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\nDone. ${ok}/${targets.length} deleted${failed ? ` (${failed} failed)` : ''}.`);
}

main().catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
});
