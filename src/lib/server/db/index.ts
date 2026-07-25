import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

// ローカルは file:local.db、本番は Turso（libsql://... + token）。
// 切り替えは環境変数だけ：TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
export const client = createClient({
	url: env.TURSO_DATABASE_URL ?? 'file:local.db',
	authToken: env.TURSO_AUTH_TOKEN
});

export const db = drizzle(client, { schema });
export { schema };

// スキーマ管理は drizzle-kit マイグレーション（drizzle/）で行う。
//   ローカル: npm run db:migrate（file:local.db に適用）
//   本番:     デプロイ前に Turso へ適用（CI か手元から）
// 実行時にはDDLを流さない（サーバーレスでの毎回DDLを避ける）。
