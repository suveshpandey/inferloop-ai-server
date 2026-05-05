import { z } from 'zod';

export const AnalyzerFinding = z.object({
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    category: z.enum(['bug', 'smell', 'complexity', 'security', 'performance', 'style']),
    title: z.string().min(1).max(150),
    description: z.string().min(1).max(2000),
    line: z.number().int().positive().optional(),
});

export const AnalyzerOutput = z.object({
    findings: z.array(AnalyzerFinding).max(10),
    summary: z.string().min(1).max(500),
});

export type AnalyzerOutputT = z.infer<typeof AnalyzerOutput>;
