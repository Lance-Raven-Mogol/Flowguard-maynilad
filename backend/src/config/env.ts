/**
 * Centralised environment configuration.
 * Reading process.env in exactly one place keeps the rest of the codebase
 * decoupled from how configuration is sourced.
 */
export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'flowguard-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  isProduction: process.env.NODE_ENV === 'production',
} as const;
