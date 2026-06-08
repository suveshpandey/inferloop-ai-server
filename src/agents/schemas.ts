import { z } from 'zod';

const SeveritySchema = z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'moderate') return 'medium';
    return normalized;
}, z.enum(['low', 'medium', 'high', 'critical']));

// DSA / CP-oriented categories. Style critiques are out of scope here — algorithm
// submissions don't get judged on whitespace. We coerce a few
// common LLM aliases (and any legacy 'style' the model still emits from its
// training data) into the canonical set so the parse doesn't fail.
const CategorySchema = z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'perf') return 'performance';
    if (normalized === 'logic') return 'bug';
    if (normalized === 'algorithm') return 'complexity';
    if (normalized === 'edge') return 'edge-case';
    if (normalized === 'edgecase') return 'edge-case';
    if (normalized === 'style') return 'smell';
    return normalized;
}, z.enum(['bug', 'smell', 'complexity', 'security', 'performance', 'edge-case']));

export const AnalyzerFinding = z.object({
    severity: SeveritySchema,
    category: CategorySchema,
    title: z.string().min(1).max(150),
    description: z.string().min(1).max(2000),
    line: z.number().int().positive().optional(),
    // Big-O strings the analyzer attaches when the finding is about the
    // algorithm's runtime or memory. Short tags like "O(n^2)" / "O(n log n)";
    // not prose. Optional because findings about, e.g., an off-by-one or a
    // missing edge case don't need them.
    timeComplexity: z.string().min(1).max(50).optional(),
    spaceComplexity: z.string().min(1).max(50).optional(),
});
export const AnalyzerOutput = z.object({
    findings: z.array(AnalyzerFinding).max(10),
    summary: z.string().min(1).max(2000),
});
export type AnalyzerOutputT = z.infer<typeof AnalyzerOutput>;


export const CriticDecision = z.enum(['keep', 'drop', 'modify'])
export const CriticOutput = z.object({
    reviewedFindings: z.array(z.object({
        decision: CriticDecision,
        original: AnalyzerFinding,
        revised: AnalyzerFinding.optional(), // present when decision == 'modify
        reason: z.string().min(1).max(500),  // why this decision
    })).max(15),
    summary: z.string().min(1).max(2000),
});
export type CriticOutputT = z.infer<typeof CriticOutput>;


export const ImproverChangeNote = z.object({
    title: z.string().min(1).max(150),
    description: z.string().min(1).max(1000),
    line: z.number().int().positive().optional(),
});
export const ImproverOutput = z.object({
    improvedCode: z.string().min(1).max(40_000),
    changeNotes: z.array(ImproverChangeNote).max(15),
    summary: z.string().min(1).max(2000),
});
export type ImproverOutputT = z.infer<typeof ImproverOutput>;


export const EvaluatorVerdict = z.enum(['improved', 'unchanged', 'regressed']);
export const EvaluatorScores = z.object({
    correctness:    z.number().int().min(0).max(100),
    bugFixCoverage: z.number().int().min(0).max(100),
    stability:      z.number().int().min(0).max(100),
    readability:    z.number().int().min(0).max(100),
    overall:        z.number().int().min(0).max(100),
    // DSA / CP-specific signals. Optional — populated only when the problem/rewrite is algorithmic.
    timeComplexityImproved: z.number().int().min(0).max(100).optional(),
    edgeCaseCoverage:       z.number().int().min(0).max(100).optional(),
    // Measured sandbox pass-rate, echoed back from ground truth. Optional — omitted when the sandbox didn't run.
    testPassRate:           z.number().int().min(0).max(100).optional(),
});
export const EvaluatorOutput = z.object({
    verdict: EvaluatorVerdict,
    scores: EvaluatorScores,
    rationale: z.string().min(1).max(2000),
    unaddressedFindings: z.array(AnalyzerFinding).max(15).optional(),
});
export type EvaluatorOutputT = z.infer<typeof EvaluatorOutput>;


// A case the code FAILED on, built in-code from sandbox results. Fed to the next
// Improver (to target the fix) and the final Evaluator (to cite failures).
// `actual` holds stdout for a wrong answer, or the stderr/reason for a crash/timeout.
export const FailedCase = z.object({
    name:        z.string(),
    input:       z.string(),
    expected:    z.string(),
    actual:      z.string(),
    errorReason: z.string(),
});
export type FailedCaseT = z.infer<typeof FailedCase>;


// Test category, with common LLM aliases coerced to the canonical set. There's
// no 'stress' category — large/constraint-boundary inputs can't be written out
// fully, so anything stress-ish collapses to 'edge'.
const TestCategorySchema = z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'example' || normalized === 'basic') return 'sample';
    if (['boundary', 'corner', 'stress', 'large', 'performance'].includes(normalized)) return 'edge';
    return normalized;
}, z.enum(['sample', 'edge']));

// A generated test case. No `source` field by design — the repo stamps
// `source: 'generated'` on persist, keeping the agent unaware of storage.
export const TestCaseSchema = z.object({
    name: z.string().min(1).max(120),
    input: z.string().max(20_000),
    expectedOutput: z.string().max(20_000),
    category: TestCategorySchema.optional(),
});
export type TestCaseSchemaT = z.infer<typeof TestCaseSchema>;

export const TestGeneratorOutput = z.object({
    cases: z.array(TestCaseSchema).min(1).max(20),
    summary: z.string().min(1).max(2000),
});
export type TestGeneratorOutputT = z.infer<typeof TestGeneratorOutput>;


export const ReviewResult = z.object({
    findings:   AnalyzerOutput,
    reviewed:   CriticOutput,
    improved:   ImproverOutput,
    evaluation: EvaluatorOutput
});
export type ReviewResultT = z.infer<typeof ReviewResult>;
