// 単体クイズの得点保存と、時間経過による減衰計算。
import { db, client } from './db';
import { quizScores } from './db/schema';

const DAY_MS = 86_400_000;

export type LatestScore = { itemId: string; score: number; takenAt: number };

/** 得点を1件保存する（同じ日でも履歴として追加）。 */
export async function saveScore(itemId: string, score: number, takenAt = Date.now()): Promise<void> {
	await db.insert(quizScores).values({ itemId, score: Math.round(score), takenAt });
}

/** 各項目の最新の得点（減衰前）を返す。 */
export async function getLatestScores(): Promise<Map<string, LatestScore>> {
	const rs = await client.execute(
		`SELECT qs.item_id, qs.score, qs.taken_at
		 FROM quiz_scores qs
		 JOIN (SELECT item_id, MAX(taken_at) mx FROM quiz_scores GROUP BY item_id) t
		   ON qs.item_id = t.item_id AND qs.taken_at = t.mx`
	);
	const map = new Map<string, LatestScore>();
	for (const r of rs.rows as unknown as { item_id: string; score: number; taken_at: number }[]) {
		map.set(r.item_id, { itemId: r.item_id, score: r.score, takenAt: r.taken_at });
	}
	return map;
}

/**
 * 減衰後の得点（純関数・DB非依存）。
 *   p(t) = p0 · e^(−t/τ),  τ = p0/5   （t は日数）
 *   ⇒ p(t) = p0 · e^(−5t/p0)
 * p0=100 なら 20日後に約37点。
 */
export function decayedScore(p0: number, takenAtMs: number, now = Date.now()): number {
	if (p0 <= 0) return 0;
	const tDays = Math.max(0, (now - takenAtMs) / DAY_MS);
	const tau = p0 / 5;
	return Math.round(p0 * Math.exp(-tDays / tau));
}
