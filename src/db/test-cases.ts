// Repository for test cases and their execution results.
//
// User-facing functions are scoped by `userId` via the `Run` relation
// (`run: { userId }`), so a forged runId resolves to "not found", not a leak.
// Pipeline-side functions (`bulkCreateGenerated`, `saveTestResults`) skip that
// check — they run server-side on an already-owned run.

import { prisma } from './client.js';

// API shape for a manual case. No `source` — it's forced to 'manual' server-side.
export type TestCaseInput = {
    name:           string;
    input:          string;
    expectedOutput: string;
    timeLimitMs?:   number | null;
    memoryLimitMb?: number | null;
};

// One stored execution result, ready for `createMany`.
export type TestResultRow = {
    testCaseId:   string;
    passed:       boolean;
    actualOutput: string | null;
    stderr:       string | null;
    exitCode:     number | null;
    durationMs:   number | null;
    errorReason:  string | null;
};

// ─────────────────────────── Read ──────────────────────────────────────────

// Returns the run's cases ordered oldest-first, or null if the run doesn't
// exist or isn't the caller's (route turns null into 404).
export async function listTestCases(runId: string, userId: string) {
    const run = await prisma.run.findFirst({
        where:  { id: runId, userId },
        select: { id: true },
    });
    if (!run) return null;

    return prisma.testCase.findMany({
        where:   { runId },
        orderBy: { createdAt: 'asc' },
    });
}

// ─────────────────────────── Create (manual) ───────────────────────────────

// Creates a single manual case after confirming the run is the caller's.
// Returns null if the run isn't owned/found.
export async function createTestCase(runId: string, userId: string, data: TestCaseInput) {
    const run = await prisma.run.findFirst({
        where:  { id: runId, userId },
        select: { id: true },
    });
    if (!run) return null;

    return prisma.testCase.create({
        data: {
            runId,
            source:         'manual',
            name:           data.name,
            input:          data.input,
            expectedOutput: data.expectedOutput,
            timeLimitMs:    data.timeLimitMs   ?? null,
            memoryLimitMb:  data.memoryLimitMb ?? null,
        },
    });
}

// ─────────────────────────── Update / Delete ───────────────────────────────

// Edit a case by id, scoped to the owner (verify-then-update so we can return
// the row). Returns null if not owned/found.
export async function updateTestCase(id: string, userId: string, data: Partial<TestCaseInput>) {
    const owned = await prisma.testCase.findFirst({
        where:  { id, run: { userId } },
        select: { id: true },
    });
    if (!owned) return null;

    return prisma.testCase.update({
        where: { id },
        data: {
            ...(data.name           !== undefined ? { name:           data.name }           : {}),
            ...(data.input          !== undefined ? { input:          data.input }          : {}),
            ...(data.expectedOutput !== undefined ? { expectedOutput: data.expectedOutput } : {}),
            ...(data.timeLimitMs    !== undefined ? { timeLimitMs:    data.timeLimitMs }    : {}),
            ...(data.memoryLimitMb  !== undefined ? { memoryLimitMb:  data.memoryLimitMb }  : {}),
        },
    });
}

// Delete a case scoped to the owner. Returns the count (0 ⇒ 404).
export async function deleteTestCase(id: string, userId: string) {
    const result = await prisma.testCase.deleteMany({
        where: { id, run: { userId } },
    });
    return result.count;
}

// ─────────────────────────── Internal (pipeline-side) ──────────────────────

// Bulk-insert AI-generated cases (pipeline-side, run already owned). Stamps `source: 'generated'`.
export async function bulkCreateGenerated(
    runId: string,
    cases: TestCaseInput[],
) {
    if (cases.length === 0) return { count: 0 };
    return prisma.testCase.createMany({
        data: cases.map((c) => ({
            runId,
            source:         'generated' as const,
            name:           c.name,
            input:          c.input,
            expectedOutput: c.expectedOutput,
            timeLimitMs:    c.timeLimitMs   ?? null,
            memoryLimitMb:  c.memoryLimitMb ?? null,
        })),
    });
}

// Persist results idempotently: wipe prior results, insert new, denormalize
// pass-rate onto Run — one transaction so listings never see a half-update.
export async function saveTestResults(
    runId: string,
    results: TestResultRow[],
    testPassRate: number | null,
) {
    await prisma.$transaction([
        prisma.testResult.deleteMany({ where: { runId } }),
        prisma.testResult.createMany({
            // Explicit columns — callers may pass enriched rows (e.g. `name`) that aren't TestResult fields.
            data: results.map((r) => ({
                runId,
                testCaseId:   r.testCaseId,
                passed:       r.passed,
                actualOutput: r.actualOutput,
                stderr:       r.stderr,
                exitCode:     r.exitCode,
                durationMs:   r.durationMs,
                errorReason:  r.errorReason,
            })),
        }),
        prisma.run.update({
            where: { id: runId },
            data:  { testPassRate },
        }),
    ]);
}
