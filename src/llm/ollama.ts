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
        }),
        signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = await res.json() as { message: {content:  string} };
    return JSON.parse(data.message.content) as T;
}