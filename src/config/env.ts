export const env = {
    PORT:                   Number(process.env.PORT) || 3001,
    NODE_ENV:               process.env.NODE_ENV || 'development',
    DATABASE_URL:           process.env.DATABASE_URL!,
    JWT_ACCESS_SECRET:      process.env.JWT_ACCESS_SECRET!,
    JWT_ACCESS_TTL:         process.env.JWT_ACCESS_TTL || '15m',
    REFRESH_TOKEN_TTL_DAYS: Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30,
    // LLM provider switch. 'ollama' for local dev (free, no key needed),
    // 'gemini' for hosted prod. Add more values here as providers are added.
    LLM_PROVIDER: (process.env.LLM_PROVIDER || 'ollama') as 'ollama' | 'gemini',
    OLLAMA_HOST:  process.env.OLLAMA_HOST  || 'http://localhost:11434',
    OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',
    // Gemini config — only required when LLM_PROVIDER=gemini. Left optional
    // so dev environments without a key still boot.
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GEMINI_MODEL:   process.env.GEMINI_MODEL   || 'gemini-2.5-flash',
    CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
}