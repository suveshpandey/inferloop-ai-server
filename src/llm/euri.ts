import { env } from "../config/env.js";

// Euri provider for chatJSON. OpenAI-compatible /chat/completions endpoint
// hosted at api.euron.one — gives access to a catalog of models (gpt, gemini,
// claude, qwen, etc.) behind a single key. Same (system, user) → parsed JSON
// contract as ollama.ts / gemini.ts.

export async function chatJSON<T>(
    systemPrompt: string,
    userPrompt: string,
): Promise<T> {
    if (!env.EURI_API_KEY) {
        throw new Error('EURI_API_KEY is not set but LLM_PROVIDER=euri');
    }

    const res = await fetch(`${env.EURI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'content-type':  'application/json',
            'authorization': `Bearer ${env.EURI_API_KEY}`,
        },
        body: JSON.stringify({
            model: env.EURI_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userPrompt   },
            ],
            // OpenAI-style JSON mode. Some upstream models on Euri may ignore
            // this; the Zod retry layer in chatJSONValidated covers that case.
            response_format: { type: 'json_object' },
            temperature: 0.2,
            // 4k was hitting truncation on Improver output (code + changeNotes +
            // summary easily exceeds 4k for non-trivial submissions). 8k is the
            // standard ceiling for the Gemini/GPT-class models served by Euri.
            max_tokens:  8_192,
        }),
        signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Euri HTTP ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
    };

    const text = data.choices?.[0]?.message?.content;
    if (!text) {
        throw new Error(`Euri returned no text: ${JSON.stringify(data).slice(0, 500)}`);
    }

    return JSON.parse(text) as T;
}
