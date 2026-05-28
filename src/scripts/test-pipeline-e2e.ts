// E2E harness for the test-driven loop (2.4). Run: pnpm tsx src/scripts/test-pipeline-e2e.ts
// Exercises the real pipeline end-to-end: generate tests (live LLM) → loop with
// sandbox runs → persist → read back. Needs Ollama/Gemini + VERCEL_* creds.
//
// Asserts MECHANICS, not case quality: the loop completes, termination is valid,
// tests generate + run, and the saved run reads back with the right rows.
// (Ollama can emit wrong expected outputs, so 100% pass-rate is NOT asserted.)

import 'dotenv/config';
import { prisma } from '../db/client.js';
import { reviewLoop } from '../orchestrator/pipeline.js';
import { saveCompletedRun, getRunForUser } from '../db/runs.js';

const PROBLEM = `Two Sum.

Given an array of n integers and a target t, decide whether two distinct indices
i, j (i != j) exist with a[i] + a[j] == t.

Input:
  Line 1: n and t (1 <= n <= 10^5, -10^9 <= t <= 10^9).
  Line 2: n space-separated integers a[i] (-10^9 <= a[i] <= 10^9).
Output:
  "YES" if such a pair exists, else "NO".`;

// Correct but O(n^2) — improvable; the loop should run cleanly either way.
const SOLUTION = `import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0]); t = int(data[1])
    a = list(map(int, data[2:2 + n]))
    for i in range(n):
        for j in range(i + 1, n):
            if a[i] + a[j] == t:
                print("YES")
                return
    print("NO")

main()`;

const VALID_REASONS = ['all-pass', 'stalled', 'no-findings', 'max-iterations'];

let failed = 0;
function assert(cond: boolean, label: string, detail?: unknown) {
    if (cond) { console.log(`PASS  ${label}`); }
    else { failed++; console.log(`FAIL  ${label}`, detail ?? ''); }
}

async function main() {
    const user = await prisma.user.create({
        data: { email: `test-e2e-${Date.now()}@example.com`, passwordHash: 'x' },
    });

    try {
        console.log('Running loop (provider:', process.env.LLM_PROVIDER || 'ollama', ')…\n');
        const result = await reviewLoop(SOLUTION, 'python', PROBLEM, 3);

        // ── Loop mechanics ──
        console.log('terminationReason:', result.terminationReason);
        console.log('testPassRate (final):', result.testPassRate);
        console.log('pass-rate trajectory:', result.iterations.map((it) => it.testPassRate).join(' → '));
        console.log('finalEvaluation verdict:', result.finalEvaluation?.verdict ?? '(none)', '\n');

        assert(result.iterations.length >= 1 && result.iterations.length <= 3, 'iterations within [1,3]', result.iterations.length);
        assert(VALID_REASONS.includes(result.terminationReason), 'valid termination reason', result.terminationReason);
        assert(result.testCases.length >= 1, 'tests were generated', result.testCases.length);
        assert(result.testPassRate !== null, 'sandbox ran (testPassRate not null — else check VERCEL creds)', result.testPassRate);
        assert(result.finalResults.length === result.testCases.length, 'final results cover every case');
        assert(result.finalEvaluation !== null, 'final evaluation produced');
        // Every iteration that ran tests reports per-case results matching the case count.
        const iterShapesOk = result.iterations.every(
            (it) => it.testPassRate === null || it.testResults.length === result.testCases.length,
        );
        assert(iterShapesOk, 'each tested iteration has per-case results');

        // ── Persistence ──
        const saved = await saveCompletedRun({
            userId: user.id, code: SOLUTION, language: 'python', problemStatement: PROBLEM,
            maxIterations: 3, loopResult: result,
        });
        const readBack = await getRunForUser(user.id, saved.id);

        assert(readBack !== null, 'run reads back');
        assert(readBack!.iterationsRun === result.iterations.length, 'iterationsRun persisted', readBack!.iterationsRun);
        assert(readBack!.iterations.length === result.iterations.length, 'iteration rows persisted');
        assert(readBack!.testCases.length === result.testCases.length, 'test case rows persisted', readBack!.testCases.length);
        assert(readBack!.testResults.length === result.finalResults.length, 'final result rows persisted', readBack!.testResults.length);
        assert(readBack!.testPassRate === result.testPassRate, 'Run.testPassRate persisted');
        assert(readBack!.finalEvaluation !== null, 'Run.finalEvaluation persisted');
        // Per-iteration evaluator output is intentionally null in the new design.
        assert(readBack!.iterations.every((it) => it.evaluatorOutput === null), 'per-iteration evaluatorOutput is null');

        console.log(failed === 0 ? '\n✅ All assertions passed.' : `\n❌ ${failed} assertion(s) failed.`);
    } finally {
        await prisma.run.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.$disconnect();
    }
    if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error('\n❌ Harness threw:', err); process.exit(1); });
