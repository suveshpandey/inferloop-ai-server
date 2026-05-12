import { env } from "../config/env.js";

export async function chatJSON<T>(
    systemPrompt: string,
    userPrompt: string
): Promise<T> {
    const res = await fetch(`${env.OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
            model: env.OLLAMA_MODEL,
            messages: [
                {role: 'system', content: systemPrompt},
                {role: 'user', content: userPrompt},
            ],
            stream: false,
            format: 'json',
            // Ollama defaults are way too small for code-review prompts:
            //   - num_ctx defaults to 2048 → input gets silently truncated
            //     from the front, causing the model to lose instructions
            //     or part of the code. The critic hits this first because
            //     its prompt = code + analyzer's findings JSON, the largest
            //     input among all four agents.
            //   - num_predict defaults to 128 → output gets cut mid-JSON,
            //     so JSON.parse throws and the agent aborts.
            // 16k context + 4k output gives healthy headroom for ~500 LOC.
            options: {
                num_ctx:     16_384,
                num_predict:  4_096,
                temperature:  0.2,
            },
        }),
        signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = await res.json() as { message: {content:  string} };
    return JSON.parse(data.message.content) as T;
}