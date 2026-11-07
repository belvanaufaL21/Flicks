import { describe, expect, it, vi } from 'vitest';
import {
  createTokenService,
  extractBearerToken,
  hashTokenSecret,
  type TokenRecord,
  type TokenRepository,
} from '../../src/server/tokens/token.service';

function makeToken(overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    id: 'token-1',
    secretHash: hashTokenSecret('valid-secret'),
    status: 'available',
    paymentId: null,
    reservedAt: null,
    consumedAt: null,
    createdAt: '2026-10-25T12:00:00.000Z',
    ...overrides,
  };
}

describe('token.service', () => {
  it('extracts a bearer token only when Authorization header is well-formed', () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('Bearer   ')).toBeNull();
    expect(extractBearerToken('Bearer secret-123')).toBe('secret-123');
  });

  it('rejects missing or unknown tokens with TOKEN_REQUIRED', async () => {
    const repository: TokenRepository = {
      findBySecretHash: vi.fn().mockResolvedValue(null),
    };
    const service = createTokenService(repository);

    await expect(service.verifyToken('')).resolves.toEqual({
      ok: false,
      code: 'TOKEN_REQUIRED',
    });
    expect(repository.findBySecretHash).not.toHaveBeenCalled();

    await expect(service.verifyToken('unknown-secret')).resolves.toEqual({
      ok: false,
      code: 'TOKEN_REQUIRED',
    });
    expect(repository.findBySecretHash).toHaveBeenCalledWith(
      hashTokenSecret('unknown-secret'),
    );
  });

  it('rejects consumed tokens with TOKEN_CONSUMED and expired tokens with TOKEN_EXPIRED', async () => {
    const consumedToken = makeToken({ status: 'consumed' });
    const repository: TokenRepository = {
      findBySecretHash: vi
        .fn()
        .mockResolvedValueOnce(consumedToken)
        .mockResolvedValueOnce(makeToken({ status: 'expired' })),
    };
    const service = createTokenService(repository);

    await expect(service.verifyToken('valid-secret')).resolves.toEqual({
      ok: false,
      code: 'TOKEN_CONSUMED',
      token: consumedToken,
    });
    await expect(service.verifyToken('valid-secret')).resolves.toEqual({
      ok: false,
      code: 'TOKEN_EXPIRED',
    });
  });

  it('atomically reserves a token once and rejects concurrent second reservation (3.4, QA-06/07)', async () => {
    let current = makeToken({ status: 'available' });
    const repository: TokenRepository = {
      findBySecretHash: vi.fn().mockImplementation(async () => current),
      reserveBySecretHash: vi
        .fn()
        .mockImplementation(async (_hash, reservedAt, allowed = ['available']) => {
          if (!allowed.includes(current.status)) {
            return null;
          }
          current = {
            ...current,
            status: 'reserved',
            reservedAt,
          };
          return current;
        }),
      consumeById: vi.fn().mockImplementation(async (_id, consumedAt) => {
        if (current.status === 'consumed') {
          return null;
        }
        current = {
          ...current,
          status: 'consumed',
          consumedAt,
        };
        return current;
      }),
    };
    const service = createTokenService(repository, {
      now: () => new Date('2026-10-25T16:00:00.000Z'),
    });

    const [first, second] = await Promise.all([
      service.reserveToken('valid-secret'),
      service.reserveToken('valid-secret'),
    ]);

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: false,
      code: 'TOKEN_CONSUMED',
    });

    const consumed = await service.consumeToken('token-1');
    expect(consumed.status).toBe('consumed');
    await expect(service.consumeToken('token-1')).rejects.toThrow(
      'TOKEN_CONSUMED',
    );
  });

  it('accepts available or reserved tokens by matching their SHA-256 secret hash', async () => {
    const token = makeToken({ status: 'available' });
    const repository: TokenRepository = {
      findBySecretHash: vi.fn().mockResolvedValue(token),
    };
    const service = createTokenService(repository);

    await expect(service.verifyToken('valid-secret')).resolves.toEqual({
      ok: true,
      token,
    });
  });

  it('creates dev tokens, persists only SHA-256 hashes, and returns raw secrets once', async () => {
    const createMany = vi.fn().mockResolvedValue(undefined);
    const repository: TokenRepository = {
      findBySecretHash: vi.fn(),
      createMany,
    };
    let index = 0;
    const service = createTokenService(repository, {
      createId: () => `token-id-${++index}`,
      createSecret: () => `raw-secret-${index}`,
      now: () => new Date('2026-10-25T15:00:00.000Z'),
    });

    const issued = await service.createDevTokens(2);

    expect(issued).toEqual([
      { id: 'token-id-1', secret: 'raw-secret-1', status: 'available' },
      { id: 'token-id-2', secret: 'raw-secret-2', status: 'available' },
    ]);
    expect(createMany).toHaveBeenCalledWith([
      {
        id: 'token-id-1',
        secretHash: hashTokenSecret('raw-secret-1'),
        status: 'available',
        paymentId: null,
        reservedAt: null,
        consumedAt: null,
        createdAt: '2026-10-25T15:00:00.000Z',
      },
      {
        id: 'token-id-2',
        secretHash: hashTokenSecret('raw-secret-2'),
        status: 'available',
        paymentId: null,
        reservedAt: null,
        consumedAt: null,
        createdAt: '2026-10-25T15:00:00.000Z',
      },
    ]);
  });

  it('rejects out-of-range dev token counts', async () => {
    const repository: TokenRepository = {
      findBySecretHash: vi.fn(),
      createMany: vi.fn(),
    };
    const service = createTokenService(repository);

    await expect(service.createDevTokens(0)).rejects.toThrow(RangeError);
    await expect(service.createDevTokens(21)).rejects.toThrow(RangeError);
    await expect(service.createDevTokens(1.5)).rejects.toThrow(RangeError);
  });
});
