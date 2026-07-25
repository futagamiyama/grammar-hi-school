import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import type { Client } from '@libsql/client';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

// ローカルは file:local.db、本番は Turso（libsql://... + token）。
// 切り替えは環境変数だけ：TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
const url = env.TURSO_DATABASE_URL ?? 'file:local.db';

// URL に応じてクライアントの実装を出し分ける（動的 import）：
//   file:      → @libsql/client（ネイティブ。ローカル開発の file: 用）
//   libsql://  → @libsql/client/web（純JS・HTTP。サーバーレス向け／ネイティブ非依存）
// これによりデプロイ関数にネイティブバイナリを持ち込まずに済む。
let clientPromise: Promise<Client> | null = null;
function getClient(): Promise<Client> {
	if (!clientPromise) {
		clientPromise = (async () => {
			if (url.startsWith('file:')) {
				const { createClient } = await import('@libsql/client');
				return createClient({ url });
			}
			const { createClient } = await import('@libsql/client/web');
			return createClient({ url, authToken: env.TURSO_AUTH_TOKEN });
		})();
	}
	return clientPromise;
}

let dbPromise: Promise<LibSQLDatabase<typeof schema>> | null = null;
export function getDb(): Promise<LibSQLDatabase<typeof schema>> {
	if (!dbPromise) dbPromise = getClient().then((c) => drizzle(c, { schema }));
	return dbPromise;
}

// 生SQL（集計クエリ）用に libSQL クライアントを直接使う場合はこちら。
export { getClient, schema };

// スキーマ管理は drizzle-kit マイグレーション（drizzle/）で行う。
//   ローカル: npm run db:migrate（file:local.db に適用）
//   本番:     npm run db:migrate:prod（.env.production 経由で Turso に適用）
// 実行時にはDDLを流さない（サーバーレスでの毎回DDLを避ける）。
