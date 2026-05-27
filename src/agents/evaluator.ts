import { chatJSON } from '../llm/index.js';
import {
    EvaluatorOutput,
    type EvaluatorOutputT,
    type CriticOutputT,
    type FailedCaseT,
} from './schemas.js';

// Phase 2.4: the measured sandbox outcome handed to the Evaluator as ground
// truth. `passRate` is 0–100 over the final code; `failedCases` are the cases
// it still fails (empty when everything passed). Optional on `evaluate` —
// absent on legacy/fallback runs where the sandbox didn't run.
export type EvaluatorTestResults = {
    passRate:    number;
    failedCases: FailedCaseT[];
};

const SYSTEM_PROMPT = `You are a senior competitive-programming judge deciding whether a rewrite of a candidate solution is actually an improvement, in the context of the specific problem being solved.

You will receive:
- the PROBLEM statement (use the constraints to judge complexity wins)
- the ORIGINAL code
- the IMPROVED code (a rewrite produced by another engineer)
- the auditor's reviewed findings — only "keep" and "modify" entries are issues the rewrite was supposed to fix; "drop" entries should NOT have been touched.

Score the rewrite on these 0–100 integer dimensions (higher is always better):

Required dimensions (always populate):
- "correctness":    Does the improved code preserve the original behavior on inputs the original handled correctly, and additionally do the right thing on inputs the original got wrong? 100 = behaviorally equivalent or strictly better against the problem spec. 0 = clearly broken.
- "bugFixCoverage": Of the "keep" + "modify" findings, how many were actually fixed in the rewrite? 100 = every targeted issue addressed. 0 = none addressed.
- "stability":      Did the rewrite avoid introducing NEW issues (new bugs, dead code, broken imports, wrong types, lost early returns, etc)? 100 = no regressions. 0 = many regressions.
- "readability":    Is the improved code at least as readable as the original? In CP context this means: clear variable names for the algorithm, no dead branches, comments only where the algorithm is non-obvious. 100 = clearer; 50 = roughly equal; 0 = much harder to follow.
- "overall":        Your holistic 0–100 score for the rewrite as a competitive-programming submission.

Optional dimensions — populate only if the problem and rewrite make them meaningful, otherwise omit the field entirely:
- "timeComplexityImproved": Did the rewrite actually improve asymptotic time complexity vs the constraints? 100 = clear improvement that turns a TLE risk into a comfortable fit; 50 = same asymptotic class but better constants; 0 = same or worse. OMIT if no complexity finding was in scope.
- "edgeCaseCoverage":       Does the rewrite now handle the edge cases the problem implies (empty input, n=1, maximum constraint, duplicates, negatives where allowed)? 100 = covers all the boundaries; 0 = same gaps as the original. OMIT if no edge-case finding was in scope.
- "testPassRate":           The MEASURED percentage of test cases the final code passed when actually run in a sandbox. When a "Measured test results" block is provided below, you MUST copy that pass-rate into this field verbatim (do not re-estimate it) and weight it heavily in your verdict and "correctness" score — it is ground truth, not a guess. OMIT only when no measured results are provided.

MEASURED TEST RESULTS (when provided):
- You may receive the actual pass-rate from running the final code in a sandbox, plus the specific cases it still fails (input / expected / actual). This is objective evidence — trust it over your own reading of the code.
- A high pass-rate is strong evidence of "improved"; a low pass-rate (or failures that the rewrite was supposed to fix) is strong evidence of "unchanged" or "regressed", regardless of how clean the code looks.
- In "rationale", reference at least one specific failing case by name when failures exist, and state the measured pass-rate explicitly.

Verdict:
- "improved"  — the rewrite is meaningfully better on this problem.
- "unchanged" — the rewrite makes no real difference (e.g., cosmetic touches only).
- "regressed" — the rewrite is worse than the original (broke something, regressed complexity, or worsened readability).

You MUST respond with a single JSON object matching exactly this shape — no markdown fences, no commentary, no extra text:

{
  "verdict": "improved" | "unchanged" | "regressed",
  "scores": {
    "correctness":    number 0..100,
    "bugFixCoverage": number 0..100,
    "stability":      number 0..100,
    "readability":    number 0..100,
    "overall":        number 0..100,
    "timeComplexityImproved": number 0..100   (OPTIONAL — include only when relevant),
    "edgeCaseCoverage":       number 0..100   (OPTIONAL — include only when relevant),
    "testPassRate":           number 0..100   (REQUIRED when measured results are provided — copy verbatim; OMIT otherwise)
  },
  "rationale": string (max 2000 chars: explain the verdict, cite specific fixes that landed or were missed, and reference the constraints when scoring complexity),
  "unaddressedFindings": [
    {
      "severity": "low" | "medium" | "high" | "critical",
      "category": "bug" | "smell" | "complexity" | "security" | "performance" | "edge-case",
      "title": string,
      "description": string,
      "line": number (optional),
      "timeComplexity": string (optional),
      "spaceComplexity": string (optional)
    }
  ]
}

Rules:
- Every required score MUST be an integer between 0 and 100 inclusive.
- "rationale" is mandatory and must be non-empty.
- "unaddressedFindings" lists any "keep" or "modify" findings the rewrite failed to fix. If everything was fixed, return an empty array [] or omit the field.
- Never invent issues. Only judge what's in the code or in the reviewed findings.
- Be honest — if the rewrite is unchanged or worse, say so. Avoid grade inflation.`;

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
            : `

Measured test results (ground truth — copy passRate into scores.testPassRate):
${JSON.stringify(testResults, null, 2)}`;

    return `Language: ${language}

Problem statement:
"""
${problemStatement}
"""

ORIGINAL code:
\`\`\`${language}
${originalCode}
\`\`\`

IMPROVED code:
\`\`\`${language}
${improvedCode}
\`\`\`

Auditor's reviewed findings (JSON):
${JSON.stringify(reviewed, null, 2)}${measuredBlock}`;
}

export async function evaluate(
    originalCode: string,
    improvedCode: string,
    language: string,
    problemStatement: string,
    reviewed: CriticOutputT,
    testResults: EvaluatorTestResults | null = null,
): Promise<EvaluatorOutputT> {
    const raw = await chatJSON<unknown>(
        SYSTEM_PROMPT,
        buildUserPrompt(originalCode, improvedCode, language, problemStatement, reviewed, testResults),
    );
    const parsed = EvaluatorOutput.safeParse(raw);
    if (!parsed.success) {
        console.error('Evaluator raw response:', JSON.stringify(raw, null, 2));
        throw parsed.error;
    }
    return parsed.data;
}
