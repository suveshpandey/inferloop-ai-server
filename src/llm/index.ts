// LLM provider dispatcher. Agents import `chatJSON` from here, never from a
// provider file. The provider is picked once at load from `env.LLM_PROVIDER`.
// To add one: write `./x.ts` exporting `chatJSON<T>(system, user)`, add a case
// below, flip `LLM_PROVIDER=x`.

import { z } from "zod";
import { env } from "../config/env.js";
import { chatJSON as ollamaChatJSON } from "./ollama.js";
import { chatJSON as geminiChatJSON } from "./gemini.js";
import { chatJSON as euriChatJSON   } from "./euri.js";

type ChatJSONFn = <T>(systemPrompt: string, userPrompt: string) => Promise<T>;

function pickProvider(): ChatJSONFn {
    switch (env.LLM_PROVIDER) {
        case 'gemini': return geminiChatJSON;
        case 'ollama': return ollamaChatJSON;
        case 'euri':   return euriChatJSON;
        default:
            // Fail loud at boot rather than silently routing to a wrong backend.
            throw new Error(`Unknown LLM_PROVIDER: ${env.LLM_PROVIDER}`);
    }
}

export const chatJSON: ChatJSONFn = pickProvider();

// chatJSON + Zod validation with bounded retries. Small models occasionally
// emit structurally wrong JSON (wrong enum value, missing/extra field); since
// temperature > 0, a re-roll usually fixes it. Throws after the last attempt —
// callers decide how to handle (the pipeline degrades gracefully).
const MAX_PARSE_ATTEMPTS = 3;

export async function chatJSONValidated<S extends z.ZodTypeAny>(
    systemPrompt: string,
    userPrompt: string,
    schema: S,
    label: string,
): Promise<z.infer<S>> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt++) {
        try {
            const raw = await chatJSON<unknown>(systemPrompt, userPrompt);
            const parsed = schema.safeParse(raw);
            if (parsed.success) return parsed.data;
            lastError = parsed.error;
            console.warn(`${label} attempt ${attempt}/${MAX_PARSE_ATTEMPTS} failed shape validation; retrying…`);
            if (attempt === MAX_PARSE_ATTEMPTS) {
                console.error(`${label} final raw response:`, JSON.stringify(raw, null, 2));
            }
        } catch (err) {
            // Also retry on unparseable JSON / transient network errors — the
            // previous version only retried Zod shape failures, so a single
            // malformed-JSON response from the model killed the whole loop.
            lastError = err;
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`${label} attempt ${attempt}/${MAX_PARSE_ATTEMPTS} failed (${msg}); retrying…`);
        }
    }
    throw lastError;
}
