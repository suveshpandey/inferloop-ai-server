import 'dotenv/config';
import { chatJSON } from '../llm/euri.js';
import { env } from '../config/env.js';

// Smoke test for the Euri provider. Hits the configured EURI_MODEL with a
// trivial JSON-returning prompt — confirms key + base URL + model are wired
// before running a full review. Independent of LLM_PROVIDER so you can probe
// Euri even when the active provider is still ollama/gemini.

const systemPrompt = 'You are a JSON-only responder. Always reply with a single JSON object and nothing else.';
const userPrompt = 'Return a JSON object with keys "ok" (boolean, true) and "message" (string, a short greeting).';

async function main() {
    console.log(`Calling Euri at ${env.EURI_BASE_URL} with model "${env.EURI_MODEL}"…`);
    const result = await chatJSON<{ ok: boolean; message: string }>(systemPrompt, userPrompt);
    console.log('Response:', JSON.stringify(result, null, 2));
    if (result.ok !== true || typeof result.message !== 'string') {
        throw new Error('Unexpected response shape');
    }
    console.log('Euri smoke test passed.');
}

main().catch((err) => {
    console.error('Euri smoke test failed:', err);
    process.exit(1);
});
