import 'server-only';
import { timingSafeEqual } from 'node:crypto';

export function hasMatchingSecret(
  expectedSecret: string | undefined,
  providedSecret: string | null,
): boolean {
  if (!expectedSecret?.trim() || !providedSecret) {
    return false;
  }

  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(providedSecret);

  return (
    expected.length === provided.length &&
    timingSafeEqual(expected, provided)
  );
}

export function hasValidDevelopmentAccess(
  nodeEnvironment: string | undefined,
  expectedToken: string | undefined,
  providedToken: string | null,
): boolean {
  return (
    nodeEnvironment !== 'production' &&
    hasMatchingSecret(expectedToken, providedToken)
  );
}
