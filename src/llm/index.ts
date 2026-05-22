// LLM provider dispatcher.
//
// Every agent imports `chatJSON` from here, never from a specific provider
// file. The active provider is picked once at module load from
// `env.LLM_PROVIDER`, so adding a new backend later (e.g., DeepSeek) is:
//   1. write `./deepseek.ts` that exports `chatJSON<T>(system, user)`
//      with the same signature and JSON-string return shape,
//   2. add one case below,
//   3. flip `LLM_PROVIDER=deepseek` in the env.
//
// The agent layer stays untouched across all of this.

import { env } from "../config/env.js";
import { chatJSON as ollamaChatJSON } from "./ollama.js";
import { chatJSON as geminiChatJSON } from "./gemini.js";

type ChatJSONFn = <T>(systemPrompt: string, userPrompt: string) => Promise<T>;

function pickProvider(): ChatJSONFn {
    switch (env.LLM_PROVIDER) {
        case 'gemini': return geminiChatJSON;
        case 'ollama': return ollamaChatJSON;
        default:
            // Unknown provider in env — fail loudly at boot rather than
            // silently falling back, so misconfigured prod doesn't quietly
            // route to a wrong (or worse, free local) backend.
            throw new Error(`Unknown LLM_PROVIDER: ${env.LLM_PROVIDER}`);
    }
}

export const chatJSON: ChatJSONFn = pickProvider();
