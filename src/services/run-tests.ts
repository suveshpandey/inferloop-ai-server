// Runs test cases through the sandbox and reports pass/fail.
// `runTestsInMemory` is the pure core (no DB) used by the pipeline mid-loop;
// `executeTestsForRun` adds DB load + persistence for the execute-tests route.

import { prisma } from '../db/client.js';
import { runCodeBatch } from '../sandbox/runner.js';
import { saveTestResults, type TestResultRow } from '../db/test-cases.js';
import { env } from '../config/env.js';
import type { RunResult, SupportedLanguage } from '../sandbox/types.js';

// A case to run before it's persisted (no DB id yet).
export type InMemoryCase = {
    name:           string;
    input:          string;
    expectedOutput: string;
};

// One in-memory result, keyed by the case's index (no DB id yet).
export type InMemoryResult = {
    caseIndex:    number;
    name:         string;
    passed:       boolean;
    actualOutput: string;
    stderr:       string;
    exitCode:     number | null;
    durationMs:   number;
    errorReason:  string;
};

export type InMemoryTestRun = {
    results:      InMemoryResult[];
    testPassRate: number | null; // null when there are no cases
};

// A result enriched with its case's name, so the route/UI skips a join.
export type ExecutedResult = TestResultRow & { name: string };

export type ExecuteTestsResult = {
    results:      ExecutedResult[];
    testPassRate: number | null; // null when the run has no cases to run
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

// Pass = clean exit AND matching output. Clean exit + wrong output is
// 'wrong_answer'; any other failure keeps the runner's reason.
function classify(exec: RunResult, expectedOutput: string): { passed: boolean; errorReason: string } {
    const passed =
        exec.errorReason === 'ok' &&
        normalizeOutput(exec.stdout) === normalizeOutput(expectedOutput);
    const errorReason =
        exec.errorReason === 'ok' ? (passed ? 'ok' : 'wrong_answer') : exec.errorReason;
    return { passed, errorReason };
}

/**
 * Pure core: run `cases` against `code` in the sandbox and score them. No DB.
 * `testPassRate` is null only when there are no cases. Throws on infra failure.
 */
export async function runTestsInMemory(
    cases: InMemoryCase[],
    code: string,
    language: SupportedLanguage,
    hooks?: {
        onCaseStart?:    (caseIndex: number, name: string) => void;
        onCaseComplete?: (result: InMemoryResult) => void;
    },
): Promise<InMemoryTestRun> {
    if (cases.length === 0) return { results: [], testPassRate: null };

    // ONE sandbox, ONE compile (C++), N execs — instead of N sandboxes. Saves
    // ~6x sandbox creations + storage and avoids hitting Vercel's rate limit.
    const execResults = await runCodeBatch({
        language,
        code,
        inputs:    cases.map((c) => c.input),
        timeoutMs: env.SANDBOX_TIMEOUT_MS,
        onCaseStart: hooks?.onCaseStart
            ? (i) => hooks.onCaseStart!(i, cases[i]!.name)
            : undefined,
        onCaseComplete: hooks?.onCaseComplete
            ? (i, exec) => {
                const c = cases[i]!;
                const { passed, errorReason } = classify(exec, c.expectedOutput);
                hooks.onCaseComplete!({
                    caseIndex:    i,
                    name:         c.name,
                    passed,
                    actualOutput: exec.stdout,
                    stderr:       exec.stderr,
                    exitCode:     exec.exitCode,
                    durationMs:   exec.durationMs,
                    errorReason,
                });
            }
            : undefined,
    });

    const results: InMemoryResult[] = execResults.map((exec, i) => {
        const c = cases[i]!;
        const { passed, errorReason } = classify(exec, c.expectedOutput);
        return {
            caseIndex:    i,
            name:         c.name,
            passed,
            actualOutput: exec.stdout,
            stderr:       exec.stderr,
            exitCode:     exec.exitCode,
            durationMs:   exec.durationMs,
            errorReason,
        };
    });

    const passed = results.filter((r) => r.passed).length;
    return { results, testPassRate: Math.round((100 * passed) / results.length) };
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
    if (cases.length === 0) return { results: [], testPassRate: null };

    const inMemCases: InMemoryCase[] = cases.map((c) => ({
        name: c.name, input: c.input, expectedOutput: c.expectedOutput,
    }));

    const { results: memResults, testPassRate } = await runTestsInMemory(
        inMemCases, run.finalCode, run.language as SupportedLanguage,
    );

    // Map in-memory results (by index) back to their persisted case ids.
    const results: ExecutedResult[] = memResults.map((r) => ({
        testCaseId:   cases[r.caseIndex]!.id,
        name:         r.name,
        passed:       r.passed,
        actualOutput: r.actualOutput,
        stderr:       r.stderr,
        exitCode:     r.exitCode,
        durationMs:   r.durationMs,
        errorReason:  r.errorReason,
    }));

    await saveTestResults(runId, results, testPassRate);
    return { results, testPassRate };
}
