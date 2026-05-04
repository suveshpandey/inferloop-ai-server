export const env = {
    PORT:                   Number(process.env.PORT) || 3001,
    NODE_ENV:               process.env.NODE_ENV || 'development',
    DATABASE_URL:           process.env.DATABASE_URL!,
    JWT_ACCESS_SECRET:      process.env.JWT_ACCESS_SECRET!,
    JWT_ACCESS_TTL:         process.env.JWT_ACCESS_TTL || '15m',
    REFRESH_TOKEN_TTL_DAYS: Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30
}