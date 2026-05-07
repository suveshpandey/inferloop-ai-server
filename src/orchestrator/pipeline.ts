import { analyze } from "../agents/analyzer.js";
import { critique } from "../agents/critic.js";
import { improve } from "../agents/improver.js";
import { evaluate } from "../agents/evaluator.js";
import type { ReviewResultT } from "../agents/schemas.js";

export async function review(code: string, language: string): Promise<ReviewResultT> {
    const findings   = await analyze(code, language);
    const reviewed   = await critique(code, language, findings);
    const improved   = await improve(code, language, reviewed);
    const evaluation = await evaluate(code, improved.improvedCode, language, reviewed);

    return { findings, reviewed, improved, evaluation };
}