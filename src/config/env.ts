/**
 * Build environment. Vercel sets VERCEL_ENV = production | preview | development.
 * Anything that isn't the production deployment (PR previews) must stay out of search engines.
 * Local builds count as production, so Lighthouse and the dist checks see the real output.
 */
const vercelEnv = process.env.VERCEL_ENV;
export const isIndexable = vercelEnv === undefined || vercelEnv === 'production';
