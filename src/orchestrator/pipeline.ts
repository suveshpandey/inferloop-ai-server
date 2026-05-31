import { analyze } from "../agents/analyzer.js";
import { critique } from "../agents/critic.js";
import { improve } from "../agents/improver.js";
import { evaluate } from "../agents/evaluator.js";
import { generateTestCases } from "../agents/test-generator.js";
import { runTestsInMemory, type InMemoryCase, type InMemoryResult } from "../services/run-tests.js";
import type {
    ReviewResultT,
    AnalyzerOutputT,
    CriticOutputT,
    ImproverOutputT,
    EvaluatorOutputT,
    TestCaseSchemaT,
    FailedCaseT,
} from "../agents/schemas.js";
import type { SupportedLanguage } from "../sandbox/types.js";

type Stage = 'analyzer' | 'critic' | 'improver' | 'evaluator';

// Test-driven when tests exist, else falls back to no-findings.
export type TerminationReason =
    | 'all-pass'        // tests reached 100%
    | 'stalled'         // pass-rate stopped improving
    | 'no-findings'     // no tests available and the analyzer found nothing
    | 'max-iterations'; // hit the cap

// The Evaluator no longer runs per iteration — it runs once at the end.
export type IterationResultT = {
    iteration:    number;
    inputCode:    string;
    findings:     AnalyzerOutputT;
    reviewed:     CriticOutputT;
    improved:     ImproverOutputT;
    testResults:  InMemoryResult[];
    testPassRate: number | null;
};

export type LoopResultT = {
    iterations:        IterationResultT[];
    finalCode:         string;
    terminationReason: TerminationReason;
    testCases:         TestCaseSchemaT[];      // generated once; persisted on the run
    testPassRate:      number | null;          // best pass-rate (denormalized to Run)
    finalResults:      InMemoryResult[];        // finalCode's per-case results (M rows)
    finalEvaluation:   EvaluatorOutputT | null; // single end-of-loop verdict
};

export type ProgressEvent =
    | { type: 'loop_start';                maxIterations: number }
    | { type: 'tests_generated';           count: number; cases: TestCaseSchemaT[] }
    | { type: 'iteration_start';           iteration: number }
    | { type: 'stage_start';               iteration: number; stage: Stage }
    | { type: 'stage_complete';            iteration: number; stage: Stage; result: unknown }
    | { type: 'tests_running';             iteration: number }
    | { type: 'test_case_start';           iteration: number; caseIndex: number; name: string }
    | { type: 'test_case_complete';        iteration: number; result: InMemoryResult }
    | { type: 'iteration_complete';        iteration: number; result: IterationResultT }
    | { type: 'final_evaluation_starting' }
    | { type: 'final_evaluation';          result: EvaluatorOutputT }
    | { type: 'loop_complete';             result: LoopResultT };

export type OnProgress = (event: ProgressEvent) => void;

function isSupportedLanguage(lang: string): lang is SupportedLanguage {
    return lang === 'python' || lang === 'cpp';
}

// Build the Improver/Evaluator FailedCase list from a run's failing results.
function toFailedCases(results: InMemoryResult[], cases: TestCaseSchemaT[]): FailedCaseT[] {
    return results
        .filter((r) => !r.passed)
        .map((r) => {
            const c = cases[r.caseIndex]!;
            return {
                name:        r.name,
                input:       c.input,
                expected:    c.expectedOutput,
                actual:      r.errorReason === 'wrong_answer' ? r.actualOutput : (r.stderr || r.errorReason),
                errorReason: r.errorReason,
            };
        });
}

/**
 * Test-driven review loop. Generates test cases once, then each iteration runs
 * Analyzer → Critic → Improver(prev failures) → sandbox tests. Pass-rate drives
 * termination; the Evaluator runs once at the end. Degrades gracefully when
 * generation or the sandbox is unavailable (runs test-free, testPassRate null).
 */
export async function reviewLoop(
    initialCode: string,
    language: string,
    problemStatement: string,
    maxIterations: number,
    onProgress?: OnProgress,
): Promise<LoopResultT> {
    const cap = Math.max(1, Math.min(5, Math.floor(maxIterations)));
    onProgress?.({ type: 'loop_start', maxIterations: cap });

    // Generate tests once, best-effort.
    let cases: TestCaseSchemaT[] = [];
    let testsAvailable = isSupportedLanguage(language);
    if (testsAvailable) {
        try {
            cases = (await generateTestCases(initialCode, language, problemStatement)).cases;
        } catch (err) {
            console.error('test generation failed; continuing without tests:', err);
        }
        testsAvailable = cases.length > 0;
        onProgress?.({ type: 'tests_generated', count: cases.length, cases });
    }
    const inMemCases: InMemoryCase[] = cases.map((c) => ({
        name: c.name, input: c.input, expectedOutput: c.expectedOutput,
    }));

    const iterations: IterationResultT[] = [];
    let   currentCode = initialCode;
    let   prevFailures: FailedCaseT[] = [];
    let   prevPassRate: number | null = null;
    let   terminationReason: TerminationReason = 'max-iterations';
    // Best iteration (highest pass-rate) → drives finalCode + final results.
    let   best: { code: string; passRate: number; results: InMemoryResult[]; reviewed: CriticOutputT } | null = null;

    for (let i = 1; i <= cap; i++) {
        onProgress?.({ type: 'iteration_start', iteration: i });

        onProgress?.({ type: 'stage_start',    iteration: i, stage: 'analyzer' });
        const findings = await analyze(currentCode, language, problemStatement);
        onProgress?.({ type: 'stage_complete', iteration: i, stage: 'analyzer', result: findings });

        onProgress?.({ type: 'stage_start',    iteration: i, stage: 'critic' });
        const reviewed = await critique(currentCode, language, problemStatement, findings);
        onProgress?.({ type: 'stage_complete', iteration: i, stage: 'critic', result: reviewed });

        onProgress?.({ type: 'stage_start',    iteration: i, stage: 'improver' });
        const improved = await improve(currentCode, language, problemStatement, reviewed, prevFailures);
        onProgress?.({ type: 'stage_complete', iteration: i, stage: 'improver', result: improved });
        const improvedCode = improved.improvedCode;

        // Run this iteration's tests, if available.
        let passRate: number | null = null;
        let results:  InMemoryResult[] = [];
        if (testsAvailable) {
            onProgress?.({ type: 'tests_running', iteration: i });
            try {
                const run = await runTestsInMemory(inMemCases, improvedCode, language as SupportedLanguage, {
                    onCaseStart: (caseIndex, name) =>
                        onProgress?.({ type: 'test_case_start', iteration: i, caseIndex, name }),
                    onCaseComplete: (result) =>
                        onProgress?.({ type: 'test_case_complete', iteration: i, result }),
                });
                passRate = run.testPassRate;
                results  = run.results;
                prevFailures = toFailedCases(results, cases);
            } catch (err) {
                // Sandbox down — stop trying tests, finish the loop test-free.
                console.error('sandbox failed; continuing without tests:', err);
                testsAvailable = false;
            }
        }

        const iterationResult: IterationResultT = {
            iteration: i, inputCode: currentCode, findings, reviewed, improved,
            testResults: results, testPassRate: passRate,
        };
        iterations.push(iterationResult);
        onProgress?.({ type: 'iteration_complete', iteration: i, result: iterationResult });

        if (passRate !== null && (best === null || passRate > best.passRate)) {
            best = { code: improvedCode, passRate, results, reviewed };
        }

        // Termination.
        if (passRate !== null) {
            if (passRate === 100) { terminationReason = 'all-pass'; break; }
            if (prevPassRate !== null && passRate <= prevPassRate) { terminationReason = 'stalled'; break; }
            prevPassRate = passRate;
        } else if (findings.findings.length === 0) {
            terminationReason = 'no-findings';
            currentCode = improvedCode;
            break;
        }
        currentCode = improvedCode;
    }

    // Surface the best code (or the last, in test-free mode).
    const lastIter  = iterations[iterations.length - 1]!;
    const finalCode =
        best !== null                       ? best.code         :
        terminationReason === 'no-findings' ? lastIter.inputCode :
        currentCode;

    const finalResults = best?.results ?? [];
    const testPassRate = best?.passRate ?? null;

    // Final Evaluator pass (once). Best-effort — a failure just leaves it null.
    let finalEvaluation: EvaluatorOutputT | null = null;
    onProgress?.({ type: 'final_evaluation_starting' });
    try {
        const reviewedForEval = best?.reviewed ?? lastIter.reviewed;
        const testResultsArg = best !== null
            ? { passRate: best.passRate, failedCases: toFailedCases(best.results, cases) }
            : null;
        finalEvaluation = await evaluate(initialCode, finalCode, language, problemStatement, reviewedForEval, testResultsArg);
        onProgress?.({ type: 'final_evaluation', result: finalEvaluation });
    } catch (err) {
        console.error('final evaluation failed:', err);
    }

    const loopResult: LoopResultT = {
        iterations, finalCode, terminationReason,
        testCases: cases, testPassRate, finalResults, finalEvaluation,
    };
    onProgress?.({ type: 'loop_complete', result: loopResult });
    return loopResult;
}

// ── Back-compat single pass for the non-streaming /api/review endpoint. ──
async function reviewOnce(
    code: string,
    language: string,
    problemStatement: string,
    iteration: number,
    onProgress?: OnProgress,
): Promise<ReviewResultT> {
    onProgress?.({ type: 'stage_start',    iteration, stage: 'analyzer' });
    const findings = await analyze(code, language, problemStatement);
    onProgress?.({ type: 'stage_complete', iteration, stage: 'analyzer', result: findings });

    onProgress?.({ type: 'stage_start',    iteration, stage: 'critic' });
    const reviewed = await critique(code, language, problemStatement, findings);
    onProgress?.({ type: 'stage_complete', iteration, stage: 'critic', result: reviewed });

    onProgress?.({ type: 'stage_start',    iteration, stage: 'improver' });
    const improved = await improve(code, language, problemStatement, reviewed);
    onProgress?.({ type: 'stage_complete', iteration, stage: 'improver', result: improved });

    onProgress?.({ type: 'stage_start',    iteration, stage: 'evaluator' });
    const evaluation = await evaluate(code, improved.improvedCode, language, problemStatement, reviewed);
    onProgress?.({ type: 'stage_complete', iteration, stage: 'evaluator', result: evaluation });

    return { findings, reviewed, improved, evaluation };
}

export async function review(
    code: string,
    language: string,
    problemStatement: string,
    onProgress?: (event: { type: 'stage_start' | 'stage_complete'; stage: Stage; result?: unknown }) => void,
): Promise<ReviewResultT> {
    const wrapped: OnProgress | undefined = onProgress
        ? (ev) => {
            if (ev.type === 'stage_start') onProgress({ type: 'stage_start', stage: ev.stage });
            else if (ev.type === 'stage_complete') onProgress({ type: 'stage_complete', stage: ev.stage, result: ev.result });
        }
        : undefined;
    return reviewOnce(code, language, problemStatement, 1, wrapped);
}
