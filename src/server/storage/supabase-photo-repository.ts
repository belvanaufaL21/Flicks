import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getRequiredEnv } from '@/server/env';
import type { StoredPhotoKind } from '@/shared/photo-policy';
import type { PhotoCleanupRepository } from '@/server/storage/cleanup-expired-photos';
import type {
  PhotoAsset,
  PhotoStorageRepository,
} from '@/server/storage/private-photo-storage';

const PRIVATE_PHOTO_BUCKET = 'flicks-private-photos';

function databasePhotoKind(
  kind: StoredPhotoKind,
): 'face' | 'full_body' | 'vto_result' {
  if (kind === 'face') return 'face';
  if (kind === 'fullBody') return 'full_body';
  return 'vto_result';
}

function appPhotoKind(dbKind: string): StoredPhotoKind {
  if (dbKind === 'face') return 'face';
  if (dbKind === 'full_body') return 'fullBody';
  if (dbKind === 'vto_result') return 'vtoResult';
  throw new Error(`Unknown database photo kind: ${dbKind}`);
}

export function createSupabasePhotoRepository(): PhotoStorageRepository &
  PhotoCleanupRepository {
  const client = createClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return {
    async upload(objectPath, bytes, mimeType) {
      const { error } = await client.storage
        .from(PRIVATE_PHOTO_BUCKET)
        .upload(objectPath, Buffer.from(bytes), {
          contentType: mimeType,
          upsert: false,
        });
      if (error) {
        throw error;
      }
    },
    async createRecord(asset) {
      const { error } = await client.from('photo_assets').insert({
        id: asset.id,
        photo_kind: databasePhotoKind(asset.kind),
        object_path: asset.objectPath,
        mime_type: asset.mimeType,
        size_bytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
        created_at: asset.createdAt,
        expires_at: asset.expiresAt,
      });
      if (error) {
        throw error;
      }
    },
    async deleteObject(objectPath) {
      const { error } = await client.storage
        .from(PRIVATE_PHOTO_BUCKET)
        .remove([objectPath]);
      if (error) {
        throw error;
      }
    },
    async listExpired(expiresBefore) {
      const { data, error } = await client
        .from('photo_assets')
        .select(
          'id, photo_kind, object_path, mime_type, size_bytes, width, height, created_at, expires_at',
        )
        .lte('expires_at', expiresBefore)
        .order('expires_at', { ascending: true });
      if (error) {
        throw error;
      }

      return data.map((row): PhotoAsset => {
        if (
          (row.photo_kind !== 'face' &&
            row.photo_kind !== 'full_body' &&
            row.photo_kind !== 'vto_result') ||
          (row.mime_type !== 'image/jpeg' &&
            row.mime_type !== 'image/png' &&
            row.mime_type !== 'image/webp')
        ) {
          throw new Error('Invalid stored photo metadata');
        }

        return {
          id: row.id,
          kind: appPhotoKind(row.photo_kind),
          objectPath: row.object_path,
          mimeType: row.mime_type,
          sizeBytes: row.size_bytes,
          width: row.width,
          height: row.height,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        };
      });
    },
    async deleteRecord(id) {
      const { error } = await client.from('photo_assets').delete().eq('id', id);
      if (error) {
        throw error;
      }
    },
    async downloadObject(objectPath) {
      const { data: meta, error: metaError } = await client
        .from('photo_assets')
        .select('mime_type')
        .eq('object_path', objectPath)
        .maybeSingle();

      if (metaError) {
        throw metaError;
      }

      const { data, error } = await client.storage
        .from(PRIVATE_PHOTO_BUCKET)
        .download(objectPath);
      if (error || !data) {
        return null;
      }

      const mimeType =
        meta?.mime_type === 'image/png' || meta?.mime_type === 'image/webp'
          ? meta.mime_type
          : 'image/jpeg';

      return {
        bytes: new Uint8Array(await data.arrayBuffer()),
        mimeType,
      };
    },
  };
}
