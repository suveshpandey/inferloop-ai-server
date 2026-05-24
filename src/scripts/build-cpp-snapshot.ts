import 'dotenv/config';
import { Sandbox } from '@vercel/sandbox';
import { env } from '../config/env.js';

// One-time setup script.
//
// Boots a fresh `node24` sandbox, installs g++ via dnf, verifies the
// compiler works on a tiny hello-world, then snapshots the VM. The returned
// snapshotId is what `runner.ts` uses for every future C++ run — fresh VM,
// but with g++ already on PATH, so cold start drops from ~30–60s back to
// the normal ~1–3s.
//
// Run once, copy the printed snapshot ID into .env as:
//   VERCEL_CPP_SNAPSHOT_ID=snap_xxxxxxxx
//
// Re-run only if you need to refresh the toolchain (e.g. switch to a newer
// g++, add boost, etc). Old snapshots can be deleted via the Vercel dashboard
// or `Snapshot.get(id).delete()`.

async function main() {
    if (!env.VERCEL_TOKEN || !env.VERCEL_TEAM_ID || !env.VERCEL_PROJECT_ID) {
        throw new Error('VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID must be set in .env.');
    }

    console.log('▶ creating fresh node24 sandbox…');
    const sandbox = await Sandbox.create({
        token:     env.VERCEL_TOKEN,
        teamId:    env.VERCEL_TEAM_ID,
        projectId: env.VERCEL_PROJECT_ID,
        runtime:   'node24',
        timeout:   10 * 60 * 1000, // 10 min — install + snapshot
    });

    try {
        console.log('▶ installing gcc-c++ (this is the slow part)…');
        const install = await sandbox.runCommand({
            cmd:  'sh',
            args: ['-c', 'sudo dnf install -y -q gcc-c++ && g++ --version'],
        });
        const installOut = await install.stdout();
        const installErr = await install.stderr();
        if (install.exitCode !== 0) {
            console.error('install stdout:', installOut);
            console.error('install stderr:', installErr);
            throw new Error(`gcc-c++ install failed with exit code ${install.exitCode}`);
        }
        console.log('  g++ version:', installOut.split('\n')[0]);

        console.log('▶ verifying compile + execute…');
        await sandbox.writeFiles([
            { path: 'hello.cpp', content: '#include <iostream>\nint main(){std::cout<<"ok";return 0;}' },
        ]);
        const verify = await sandbox.runCommand({
            cmd:  'sh',
            args: ['-c', 'g++ -O2 -std=c++17 -o hello hello.cpp && ./hello'],
        });
        const verifyOut = await verify.stdout();
        if (verify.exitCode !== 0 || verifyOut.trim() !== 'ok') {
            throw new Error(`verify failed: exit=${verify.exitCode}, stdout="${verifyOut}"`);
        }
        console.log('  verified: g++ compiles and runs');

        console.log('▶ snapshotting (this stops the sandbox)…');
        // expiration: 0 ⇒ snapshot never expires. We control deletion manually.
        const snap = await sandbox.snapshot({ expiration: 0 });

        console.log('\n✅ snapshot created');
        console.log(`   snapshotId: ${snap.snapshotId}`);
        console.log(`   size:       ${(snap.sizeBytes / 1024 / 1024).toFixed(1)} MB`);
        console.log('\nAdd this to inferloop-server/.env:');
        console.log(`   VERCEL_CPP_SNAPSHOT_ID=${snap.snapshotId}`);
    } catch (err) {
        // Snapshot() stops the sandbox itself; only stop on the failure path.
        await sandbox.stop().catch(() => {});
        throw err;
    }
}

main().catch((err) => {
    console.error('Snapshot builder crashed:', err);
    process.exit(1);
});
