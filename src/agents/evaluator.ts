import { chatJSONValidated } from '../llm/index.js';
import {
    EvaluatorOutput,
    type EvaluatorOutputT,
    type CriticOutputT,
    type FailedCaseT,
} from './schemas.js';

// Measured sandbox outcome over the final code, handed to the Evaluator as
// ground truth. `failedCases` is empty when everything passed.
export type EvaluatorTestResults = {
    passRate:    number;
    failedCases: FailedCaseT[];
};

const SYSTEM_PROMPT = `Judge whether a rewrite of a competitive-programming solution is actually an improvement on the specific problem. Inputs: problem statement (constraints matter), original code, improved code, the auditor's reviewed findings ("keep"/"modify" = issues the rewrite was supposed to fix; "drop" = should have been left alone), optionally measured sandbox test results (passRate + still-failing cases).

VERDICT: "improved" (meaningfully better) | "unchanged" (no real difference) | "regressed" (worse — broke something, regressed complexity, or hurt readability).

REQUIRED SCORES (0–100 ints, higher is better):
- correctness:    preserves original-correct behavior AND fixes original-wrong inputs. 100 = equivalent or strictly better; 0 = clearly broken.
- bugFixCoverage: fraction of "keep"+"modify" findings actually fixed.
- stability:      avoided NEW issues (new bugs, dead code, broken imports, lost early returns). 100 = no regressions.
- readability:    at least as readable as the original. 100 = clearer; 50 = equal; 0 = much harder.
- overall:        holistic score.

OPTIONAL SCORES — include ONLY when meaningful, else OMIT:
- timeComplexityImproved: 100 = clear TLE→fit win; 50 = same class, better constants; 0 = same/worse. Omit if no complexity finding was in scope.
- edgeCaseCoverage:       100 = covers all problem-implied boundaries (empty / n=1 / max / duplicates / negatives); 0 = same gaps. Omit if no edge-case finding was in scope.
- testPassRate:           when measured results are provided, COPY their passRate verbatim (do not re-estimate) and weight it heavily in the verdict + correctness. OMIT only when no measured results.

When measured results are present: trust them over your reading. High pass-rate ⇒ "improved"; low pass-rate (or failures the rewrite was supposed to fix) ⇒ "unchanged"/"regressed". In rationale, state the measured pass-rate AND name at least one failing case.

Be honest — no grade inflation. Never invent issues; judge only what's in the code or findings.

Respond with a SINGLE JSON object — no markdown fences, no commentary:
{
  "verdict":  "improved" | "unchanged" | "regressed",
  "scores":   { "correctness": int, "bugFixCoverage": int, "stability": int, "readability": int, "overall": int,
                "timeComplexityImproved"?: int, "edgeCaseCoverage"?: int, "testPassRate"?: int },     // ints 0..100
  "rationale": string,                                                                                // max 2000 chars; non-empty
  "unaddressedFindings"?: [ { "severity": "low"|"medium"|"high"|"critical",
                              "category": "bug"|"smell"|"complexity"|"security"|"performance"|"edge-case",
                              "title": string, "description": string,
                              "line"?: int, "timeComplexity"?: string, "spaceComplexity"?: string } ]  // "keep"/"modify" findings the rewrite failed to fix; omit or [] if all fixed
}`;

function buildUserPrompt(
    originalCode: string,
    improvedCode: string,
    language: string,
    problemStatement: string,
    reviewed: CriticOutputT,
    testResults: EvaluatorTestResults | null,
): string {
    const measuredBlock =
        testResults === null
            ? ''
            : `\n\nMeasured results (ground truth — copy passRate into scores.testPassRate):\n${JSON.stringify(testResults)}`;

    // Strip "drop" entries — bugFixCoverage only counts keep + modify, and
    // drops don't constrain the rewrite, so sending them costs tokens for nothing.
    const actionable = {
        ...reviewed,
        reviewedFindings: reviewed.reviewedFindings.filter((f) => f.decision !== 'drop'),
    };

    return `Language: ${language}

Problem:
${problemStatement}

Original:
\`\`\`${language}
${originalCode}
\`\`\`

Improved:
\`\`\`${language}
${improvedCode}
\`\`\`

Reviewed findings (keep + modify only):
${JSON.stringify(actionable)}${measuredBlock}`;
}

export async function evaluate(
    originalCode: string,
    improvedCode: string,
    language: string,
    problemStatement: string,
    reviewed: CriticOutputT,
    testResults: EvaluatorTestResults | null = null,
): Promise<EvaluatorOutputT> {
    return chatJSONValidated(
        SYSTEM_PROMPT,
        buildUserPrompt(originalCode, improvedCode, language, problemStatement, reviewed, testResults),
        EvaluatorOutput,
        'Evaluator',
    );
}
