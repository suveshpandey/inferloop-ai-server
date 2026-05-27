import { env } from "../config/env.js";

// Gemini provider for chatJSON. Hits Google's Generative Language REST API
// directly (no SDK). Same (system, user) → parsed JSON contract as ollama.ts.
// JSON-mode via `responseMimeType: 'application/json'`; the agent's Zod schema
// validates the shape on top.

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function chatJSON<T>(
    systemPrompt: string,
    userPrompt: string
): Promise<T> {
    if (!env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not set but LLM_PROVIDER=gemini');
    }

    const url = `${GEMINI_ENDPOINT}/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature:      0.2,
                // Mirrors ollama's num_predict=4096 — room for a full response without truncation.
                maxOutputTokens:  4_096,
            },
        }),
        signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error(`Gemini returned no text: ${JSON.stringify(data).slice(0, 500)}`);
    }

    return JSON.parse(text) as T;
}
