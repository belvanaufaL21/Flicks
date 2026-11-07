import 'server-only';

export function getRequiredEnv(
  name: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = environment[name];
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
