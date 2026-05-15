// Repository layer for review-history persistence. The orchestrator stays
// pure (in-memory loop only); this module is the single seam where a
// completed `LoopResultT` becomes durable rows in Postgres.

import { prisma } from './client.js';
import type { LoopResultT } from '../orchestrator/pipeline.js';

// ─────────────────────────── Title heuristic ───────────────────────────────
//
// Sidebar Recents need a short, human-readable label. We don't ask the user
// to name their run — we derive it from the input. First non-empty,
// non-comment-looking line, trimmed to 60 chars, with the language prefixed.
// Falls back to "<language> review" if nothing usable is found.
function deriveTitle(code: string, language: string): string {
    const firstLine = code
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0 && !/^(\/\/|#|\/\*|\*)/.test(l));

    if (!firstLine) return `${language} review`;
    const trimmed = firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine;
    return `${language} · ${trimmed}`;
}

// ─────────────────────────── Save a finished run ────────────────────────────
//
// Called from the SSE route once `reviewLoop` resolves. One transaction
// inserts the Run + all its Iterations atomically — a half-saved run on
// crash is worse than no save at all.
export async function saveCompletedRun(params: {
    userId:        string;
    code:          string;
    language:      string;
    maxIterations: number;
    loopResult:    LoopResultT;
}) {
    const { userId, code, language, maxIterations, loopResult } = params;
    const { iterations, finalCode, terminationReason } = loopResult;

    const lastIter   = iterations[iterations.length - 1];
    const finalScore = lastIter?.evaluation.scores.overall ?? null;

    return prisma.run.create({
        data: {
            userId,
            title:             deriveTitle(code, language),
            language,
            code,
            finalCode,
            maxIterations,
            iterationsRun:     iterations.length,
            terminationReason,
            finalScore,
            completedAt:       new Date(),
            iterations: {
                create: iterations.map((it) => ({
                    iterationIndex:  it.iteration,
                    inputCode:       it.inputCode,
                    analyzerOutput:  it.findings,
                    criticOutput:    it.reviewed,
                    improverOutput:  it.improved,
                    evaluatorOutput: it.evaluation,
                    overallScore:    it.evaluation.scores.overall,
                })),
            },
        },
    });
}

// ─────────────────────────── Listing for the sidebar ────────────────────────
//
// Lightweight projection — no JSON blobs, no iteration rows. The sidebar
// renders dozens of these; pulling the full payload would be wasteful.
export async function listRunsForUser(userId: string, limit = 30) {
    return prisma.run.findMany({
        where:   { userId },
        orderBy: { createdAt: 'desc' },
        take:    limit,
        select: {
            id:                true,
            title:             true,
            language:          true,
            finalScore:        true,
            iterationsRun:     true,
            terminationReason: true,
            createdAt:         true,
        },
    });
}

// ─────────────────────────── Delete a run ──────────────────────────────────
//
// Cascade on the `Run → Iteration` relation wipes the iteration rows
// automatically (see schema.prisma). We scope the delete by `userId` in the
// where clause as a defense-in-depth — a route bug that forgets to check
// ownership can't accidentally delete someone else's run. Returns the count
// of rows deleted (0 if not found / not owned) so the route can 404 cleanly.
export async function deleteRunForUser(userId: string, runId: string) {
    const result = await prisma.run.deleteMany({
        where: { id: runId, userId },
    });
    return result.count;
}

// ─────────────────────────── Full detail for the history view ──────────────
//
// Ordered iterations included. Returns null if the run doesn't exist or
// belongs to a different user — callers translate that to 404.
export async function getRunForUser(userId: string, runId: string) {
    const run = await prisma.run.findFirst({
        where: { id: runId, userId },
        include: {
            iterations: { orderBy: { iterationIndex: 'asc' } },
        },
    });
    return run;
}
