// LLM provider dispatcher. Agents import `chatJSON` from here, never from a
// provider file. The provider is picked once at load from `env.LLM_PROVIDER`.
// To add one: write `./x.ts` exporting `chatJSON<T>(system, user)`, add a case
// below, flip `LLM_PROVIDER=x`.

import { env } from "../config/env.js";
import { chatJSON as ollamaChatJSON } from "./ollama.js";
import { chatJSON as geminiChatJSON } from "./gemini.js";

type ChatJSONFn = <T>(systemPrompt: string, userPrompt: string) => Promise<T>;

function pickProvider(): ChatJSONFn {
    switch (env.LLM_PROVIDER) {
        case 'gemini': return geminiChatJSON;
        case 'ollama': return ollamaChatJSON;
        default:
            // Fail loud at boot rather than silently routing to a wrong backend.
            throw new Error(`Unknown LLM_PROVIDER: ${env.LLM_PROVIDER}`);
    }
}

export const chatJSON: ChatJSONFn = pickProvider();
