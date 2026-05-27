// Runs a run's test cases through the sandbox and persists the results.
// Sits between the repo (db/test-cases.ts) and the sandbox runner.

import { prisma } from '../db/client.js';
import { runCode } from '../sandbox/runner.js';
import { saveTestResults, type TestResultRow } from '../db/test-cases.js';
import { env } from '../config/env.js';
import type { SupportedLanguage } from '../sandbox/types.js';

// Cap on concurrent sandbox calls — Vercel rate-limits sandbox creation.
const MAX_PARALLEL = 3;

// A result enriched with its case's name, so the route/UI skips a join.
export type ExecutedResult = TestResultRow & {
    name: string;
};

export type ExecuteTestsResult = {
    results:      ExecutedResult[];
    // 0–100, or null when the run has no cases to run.
    testPassRate: number | null;
};

// Normalise CP-style stdout: strip trailing whitespace per line + trailing
// blank lines, so a missing final newline doesn't fail a correct answer.
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
 * Run a run's cases against its `finalCode` and persist results. Idempotent.
 * Returns null if the run isn't the caller's (→ 404); `{ results: [],
 * testPassRate: null }` if it has no cases yet.
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

        // Pass = clean exit AND matching output. Clean exit + wrong output is
        // 'wrong_answer'; any other failure keeps the runner's reason.
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
