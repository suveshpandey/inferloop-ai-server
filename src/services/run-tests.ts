// Service: run every test case of a run through the sandbox and store the
// results. Sits between the repo layer (db/test-cases.ts) and the sandbox
// runner (sandbox/runner.ts). Stateless — all persistence goes through the
// repo. The pipeline (Sub-phase 2.4) and the execute-tests route both call
// `executeTestsForRun`.

import { prisma } from '../db/client.js';
import { runCode } from '../sandbox/runner.js';
import { saveTestResults, type TestResultRow } from '../db/test-cases.js';
import { env } from '../config/env.js';
import type { SupportedLanguage } from '../sandbox/types.js';

// At most this many cases hit the sandbox at once. Vercel rate-limits sandbox
// creation; 3 keeps us well under it while still parallelising the common
// 5–8-case run.
const MAX_PARALLEL = 3;

// One result enriched with its case's name so the route/UI can render rows
// without a second join.
export type ExecutedResult = TestResultRow & {
    name: string;
};

export type ExecuteTestsResult = {
    results:      ExecutedResult[];
    // 0–100, or null when the run has no cases to run.
    testPassRate: number | null;
};

// Trailing whitespace per line + trailing blank lines are insignificant for
// CP-style stdout comparison. Normalise both sides the same way so a missing
// final newline doesn't fail an otherwise-correct answer.
function normalizeOutput(s: string): string {
    return s
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.replace(/\s+$/, ''))
        .join('\n')
        .replace(/\n+$/, '');
}

// Run `fn` over `items` with at most `limit` in flight at once. Preserves
// input order in the output array.
async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const idx = next++;
            results[idx] = await fn(items[idx]!);
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, worker),
    );
    return results;
}

/**
 * Execute all test cases for a run against its `finalCode` and persist the
 * results. Idempotent: re-running replaces prior results.
 *
 * Returns null when the run doesn't exist or isn't the caller's (route → 404).
 * Returns `{ results: [], testPassRate: null }` when the run exists but has no
 * cases yet — nothing to run, but not an error.
 */
export async function executeTestsForRun(
    runId: string,
    userId: string,
): Promise<ExecuteTestsResult | null> {
    const run = await prisma.run.findFirst({
        where:  { id: runId, userId },
        select: { id: true, finalCode: true, language: true },
    });
    if (!run) return null;

    const cases = await prisma.testCase.findMany({
        where:   { runId },
        orderBy: { createdAt: 'asc' },
    });
    if (cases.length === 0) {
        return { results: [], testPassRate: null };
    }

    const language  = run.language as SupportedLanguage;
    const finalCode = run.finalCode;

    const results = await mapWithConcurrency(cases, MAX_PARALLEL, async (c): Promise<ExecutedResult> => {
        const exec = await runCode({
            language,
            code:      finalCode,
            stdin:     c.input,
            timeoutMs: c.timeLimitMs ?? env.SANDBOX_TIMEOUT_MS,
        });

        // A case passes only when the program exited cleanly AND its output
        // matches. A clean exit with wrong output is 'wrong_answer'; any other
        // failure (timeout, crash, compile error, sandbox issue) carries the
        // runner's reason through unchanged.
        const outputMatches =
            exec.errorReason === 'ok' &&
            normalizeOutput(exec.stdout) === normalizeOutput(c.expectedOutput);

        const errorReason =
            exec.errorReason === 'ok'
                ? (outputMatches ? 'ok' : 'wrong_answer')
                : exec.errorReason;

        return {
            testCaseId:   c.id,
            name:         c.name,
            passed:       outputMatches,
            actualOutput: exec.stdout,
            stderr:       exec.stderr,
            exitCode:     exec.exitCode,
            durationMs:   exec.durationMs,
            errorReason,
        };
    });

    const passed       = results.filter((r) => r.passed).length;
    const testPassRate = Math.round((100 * passed) / results.length);

    await saveTestResults(runId, results, testPassRate);

    return { results, testPassRate };
}
