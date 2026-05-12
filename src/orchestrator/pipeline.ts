import { analyze } from "../agents/analyzer.js";
import { critique } from "../agents/critic.js";
import { improve } from "../agents/improver.js";
import { evaluate } from "../agents/evaluator.js";
import type { ReviewResultT } from "../agents/schemas.js";

type Stage = 'analyzer' | 'critic' | 'improver' | 'evaluator';

export type TerminationReason =
    | 'converged'        // evaluator says "unchanged" — no more improvements possible
    | 'regressed'        // evaluator says "regressed" — rolling back to prior iteration
    | 'no-findings'      // analyzer found nothing to fix
    | 'max-iterations';  // hit the cap

export type IterationResultT = ReviewResultT & {
    /** 1-based iteration index. */
    iteration: number;
    /** The code that was fed into this iteration (= initial code for i=1, prior
     *  iteration's improvedCode for i>1). */
    inputCode: string;
};

export type LoopResultT = {
    iterations:        IterationResultT[];
    finalCode:         string;
    terminationReason: TerminationReason;
};

// Every progress event carries `iteration` so the frontend can group events
// by iteration card. `loop_start` / `iteration_start` / `iteration_complete`
// are the new milestone events; `stage_*` mirror the per-stage events from
// the single-pass pipeline but with the iteration index attached.
export type ProgressEvent =
    | { type: 'loop_start';         maxIterations: number }
    | { type: 'iteration_start';    iteration: number }
    | { type: 'stage_start';        iteration: number; stage: Stage }
    | { type: 'stage_complete';     iteration: number; stage: Stage; result: unknown }
    | { type: 'iteration_complete'; iteration: number; result: IterationResultT }
    | { type: 'loop_complete';      result: LoopResultT };

export type OnProgress = (event: ProgressEvent) => void;

// Single pass through the four agents. Same shape as before — kept private to
// this module so callers go through `reviewLoop` or the back-compat `review`.
async function reviewOnce(
    code: string,
    language: string,
    iteration: number,
    onProgress?: OnProgress,
): Promise<ReviewResultT> {
    onProgress?.({ type: 'stage_start',    iteration, stage: 'analyzer' });
    const findings = await analyze(code, language);
    onProgress?.({ type: 'stage_complete', iteration, stage: 'analyzer', result: findings });

    onProgress?.({ type: 'stage_start',    iteration, stage: 'critic' });
    const reviewed = await critique(code, language, findings);
    onProgress?.({ type: 'stage_complete', iteration, stage: 'critic', result: reviewed });

    onProgress?.({ type: 'stage_start',    iteration, stage: 'improver' });
    const improved = await improve(code, language, reviewed);
    onProgress?.({ type: 'stage_complete', iteration, stage: 'improver', result: improved });

    onProgress?.({ type: 'stage_start',    iteration, stage: 'evaluator' });
    const evaluation = await evaluate(code, improved.improvedCode, language, reviewed);
    onProgress?.({ type: 'stage_complete', iteration, stage: 'evaluator', result: evaluation });

    return { findings, reviewed, improved, evaluation };
}

/**
 * Iterative review loop. Runs `reviewOnce` up to `maxIterations` times, feeding
 * each iteration's improved code as input to the next, until one of the
 * termination conditions fires.
 *
 * Termination:
 *   - `no-findings`    — analyzer returned an empty findings list.
 *   - `converged`      — evaluator verdict === 'unchanged' (no further improvement possible).
 *   - `regressed`      — evaluator verdict === 'regressed' (improver made it worse; roll back).
 *   - `max-iterations` — hit the cap.
 *
 * Final code:
 *   - `regressed` / `no-findings` → the prior iteration's input (skip the regression / no-op).
 *   - Otherwise → the last iteration's improvedCode.
 */
export async function reviewLoop(
    initialCode: string,
    language: string,
    maxIterations: number,
    onProgress?: OnProgress,
): Promise<LoopResultT> {
    // Clamp at runtime as a defense-in-depth — the route already validates.
    const cap = Math.max(1, Math.min(5, Math.floor(maxIterations)));

    onProgress?.({ type: 'loop_start', maxIterations: cap });

    const iterations: IterationResultT[] = [];
    let   currentCode        = initialCode;
    let   terminationReason: TerminationReason = 'max-iterations';

    for (let i = 1; i <= cap; i++) {
        onProgress?.({ type: 'iteration_start', iteration: i });

        const result = await reviewOnce(currentCode, language, i, onProgress);
        const iterationResult: IterationResultT = {
            ...result,
            iteration: i,
            inputCode: currentCode,
        };
        iterations.push(iterationResult);

        onProgress?.({ type: 'iteration_complete', iteration: i, result: iterationResult });

        // Termination checks — order matters.
        if (result.findings.findings.length === 0) {
            terminationReason = 'no-findings';
            break;
        }
        if (result.evaluation.verdict === 'regressed') {
            terminationReason = 'regressed';
            break;
        }
        if (result.evaluation.verdict === 'unchanged') {
            terminationReason = 'converged';
            break;
        }
        // verdict === 'improved' — chain the improved code into next iteration.
        currentCode = result.improved.improvedCode;
    }

    // Decide which code to surface as the "final" optimized version.
    const last = iterations[iterations.length - 1];
    const finalCode =
        terminationReason === 'regressed'    ? last.inputCode :
        terminationReason === 'no-findings'  ? last.inputCode :
        last.improved.improvedCode;

    const loopResult: LoopResultT = {
        iterations,
        finalCode,
        terminationReason,
    };

    onProgress?.({ type: 'loop_complete', result: loopResult });
    return loopResult;
}

// Back-compat for the non-streaming `/api/review` endpoint and any other
// callers that want a single-pass result. Delegates to `reviewOnce`.
export async function review(
    code: string,
    language: string,
    onProgress?: (event: { type: 'stage_start' | 'stage_complete'; stage: Stage; result?: unknown }) => void,
): Promise<ReviewResultT> {
    const wrapped: OnProgress | undefined = onProgress
        ? (ev) => {
            if (ev.type === 'stage_start') {
                onProgress({ type: 'stage_start', stage: ev.stage });
            } else if (ev.type === 'stage_complete') {
                onProgress({ type: 'stage_complete', stage: ev.stage, result: ev.result });
            }
        }
        : undefined;
    return reviewOnce(code, language, 1, wrapped);
}
