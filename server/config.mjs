export const isProduction = () => process.env.NODE_ENV === 'production';
export function validateProductionConfig() {
  if (!isProduction()) return;
  for (const key of ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME','PUBLIC_ORIGIN']) if (!process.env[key]) throw new Error(`Production requires ${key}`);
  if (process.env.DB_USER === 'root') throw new Error('Production requires a dedicated database user');
  if (process.env.APP_ENV === 'test') throw new Error('Production cannot use APP_ENV=test');
  const origin = new URL(process.env.PUBLIC_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== process.env.PUBLIC_ORIGIN) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash');
}
