export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. Set it via: npx convex env set ${key} "your-value"`
    );
  }
  return value;
}
