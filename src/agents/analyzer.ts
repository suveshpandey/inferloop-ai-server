import { chatJSON } from '../llm/ollama.js';
import { AnalyzerOutput, type AnalyzerOutputT } from './schemas.js';

const SYSTEM_PROMPT = `You are a senior code reviewer. Analyze the user's code and return a list of concrete issues.

You MUST respond with a single JSON object matching exactly this shape, with no markdown fences, no commentary, no extra text:

{
  "findings": [
    {
      "severity": "low" | "medium" | "high" | "critical",
      "category": "bug" | "smell" | "complexity" | "security" | "performance" | "style",
      "title": string (max 150 chars, concise),
      "description": string (one paragraph, why it's a problem and how to think about fixing it),
      "line": number (optional, 1-indexed line number where the issue lives)
    }
  ],
  "summary": string (max 500 chars, overall takeaway)
}

Rules:
- Return at most 10 findings, ordered by severity (critical first).
- If the code is clean, return an empty findings array and an honest summary.
- Do not invent issues. Each finding must point to something concrete in the provided code.
- Do not include markdown, backticks, or any prose outside the JSON object.`;

function buildUserPrompt(code: string, language: string): string {
    return `Language: ${language}\n\nCode:\n\`\`\`${language}\n${code}\n\`\`\``;
}

export async function analyze(code: string, language: string): Promise<AnalyzerOutputT> {
    const raw = await chatJSON<unknown>(SYSTEM_PROMPT, buildUserPrompt(code, language));
    const parsed = AnalyzerOutput.safeParse(raw);
    if (!parsed.success) {
        console.error('Analyzer raw response:', JSON.stringify(raw, null, 2));
        throw parsed.error;
    }
    return parsed.data;
}
