import { analyze } from "../agents/analyzer.js";
import { critique } from "../agents/critic.js";
import { improve } from "../agents/improver.js";
import { evaluate } from "../agents/evaluator.js";
import type { ReviewResultT } from "../agents/schemas.js";

type Stage = 'analyzer' | 'critic' | 'improver' | 'evaluator';

type ProgressEvent =
    | { type: 'stage_start'; stage: Stage }
    | { type: 'stage_complete'; stage: Stage; result: unknown };

export type OnProgress = (event: ProgressEvent) => void;

export async function review(
    code: string,
    language: string,
    onProgress?: OnProgress,
): Promise<ReviewResultT> {
    onProgress?.({ type: 'stage_start', stage: 'analyzer' });
    const findings = await analyze(code, language);
    onProgress?.({ type: 'stage_complete', stage: 'analyzer', result: findings });

    onProgress?.({ type: 'stage_start', stage: 'critic' });
    const reviewed = await critique(code, language, findings);
    onProgress?.({ type: 'stage_complete', stage: 'critic', result: reviewed });

    onProgress?.({ type: 'stage_start', stage: 'improver' });
    const improved = await improve(code, language, reviewed);
    onProgress?.({ type: 'stage_complete', stage: 'improver', result: improved });

    onProgress?.({ type: 'stage_start', stage: 'evaluator' });
    const evaluation = await evaluate(code, improved.improvedCode, language, reviewed);
    onProgress?.({ type: 'stage_complete', stage: 'evaluator', result: evaluation });

    return { findings, reviewed, improved, evaluation };
}
