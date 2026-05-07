import { z } from 'zod';

const SeveritySchema = z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'moderate') return 'medium';
    return normalized;
}, z.enum(['low', 'medium', 'high', 'critical']));

const CategorySchema = z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'perf') return 'performance';
    if (normalized === 'logic') return 'complexity';
    return normalized;
}, z.enum(['bug', 'smell', 'complexity', 'security', 'performance', 'style']));

export const AnalyzerFinding = z.object({
    severity: SeveritySchema,
    category: CategorySchema,
    title: z.string().min(1).max(150),
    description: z.string().min(1).max(2000),
    line: z.number().int().positive().optional(),
});
export const AnalyzerOutput = z.object({
    findings: z.array(AnalyzerFinding).max(10),
    summary: z.string().min(1).max(500),
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
    summary: z.string().min(1).max(500),
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
    summary: z.string().min(1).max(500),
});
export type ImproverOutputT = z.infer<typeof ImproverOutput>;


export const EvaluatorVerdict = z.enum(['improved', 'unchanged', 'regressed']);
export const EvaluatorScores = z.object({
    correctness:    z.number().int().min(0).max(100),
    bugFixCoverage: z.number().int().min(0).max(100),
    stability:      z.number().int().min(0).max(100),
    readability:    z.number().int().min(0).max(100),
    overall:        z.number().int().min(0).max(100),
});
export const EvaluatorOutput = z.object({
    verdict: EvaluatorVerdict,
    scores: EvaluatorScores,
    rationale: z.string().min(1).max(2000),
    unaddressedFindings: z.array(AnalyzerFinding).max(15).optional(),
});
export type EvaluatorOutputT = z.infer<typeof EvaluatorOutput>;