import { createEmptyCard, fsrs, State, type Card, type Grade } from 'ts-fsrs';
import { eq, lte, gt, asc, count, min } from 'drizzle-orm';
import { getDb } from './db';
import { cards, reviewLogs, type CardRow } from './db/schema';
import { orderedItemIds } from './content';

const scheduler = fsrs();

function rowToCard(row: CardRow): Card {
	return {
		due: new Date(row.due),
		stability: row.stability,
		difficulty: row.difficulty,
		elapsed_days: row.elapsedDays,
		scheduled_days: row.scheduledDays,
		learning_steps: row.learningSteps,
		reps: row.reps,
		lapses: row.lapses,
		state: row.state as State,
		last_review: row.lastReview != null ? new Date(row.lastReview) : undefined
	};
}

function cardToRow(itemId: string, card: Card) {
	return {
		itemId,
		due: card.due.getTime(),
		stability: card.stability,
		difficulty: card.difficulty,
		elapsedDays: card.elapsed_days,
		scheduledDays: card.scheduled_days,
		learningSteps: card.learning_steps,
		reps: card.reps,
		lapses: card.lapses,
		state: card.state,
		lastReview: card.last_review ? card.last_review.getTime() : null
	};
}

export type NextItem = { itemId: string; kind: 'review' | 'new' } | null;

/** 次に学習すべき項目を返す。まず期限の来た復習、なければ未導入の新規項目（index順）。 */
export async function getNextItem(now = Date.now()): Promise<NextItem> {
	const db = await getDb();
	const dueRow = await db
		.select({ itemId: cards.itemId })
		.from(cards)
		.where(lte(cards.due, now))
		.orderBy(asc(cards.due))
		.limit(1)
		.get();

	if (dueRow) return { itemId: dueRow.itemId, kind: 'review' };

	const rows = await db.select({ itemId: cards.itemId }).from(cards).all();
	const introduced = new Set(rows.map((r) => r.itemId));
	for (const id of orderedItemIds) {
		if (!introduced.has(id)) return { itemId: id, kind: 'new' };
	}
	return null;
}

export type Stats = {
	total: number;
	introduced: number;
	dueCount: number;
	newRemaining: number;
	nextDue: number | null; // epoch ms
};

export async function getStats(now = Date.now()): Promise<Stats> {
	const db = await getDb();
	const total = orderedItemIds.length;
	const introduced = (await db.select({ c: count() }).from(cards).get())?.c ?? 0;
	const dueCount = (await db.select({ c: count() }).from(cards).where(lte(cards.due, now)).get())?.c ?? 0;
	const nextDue = (await db.select({ m: min(cards.due) }).from(cards).where(gt(cards.due, now)).get())?.m ?? null;

	return {
		total,
		introduced,
		dueCount,
		newRemaining: total - introduced,
		nextDue
	};
}

export type RateResult = {
	itemId: string;
	rating: Grade;
	state: State;
	scheduledDays: number;
	due: string; // ISO
};

/** 評価を適用してFSRSカードを更新し、履歴を残す。 */
export async function applyRating(
	itemId: string,
	rating: Grade,
	meta: { correctCount: number; totalCount: number; elapsedMs: number },
	now = new Date()
): Promise<RateResult> {
	const db = await getDb();
	const existing = await db.select().from(cards).where(eq(cards.itemId, itemId)).get();
	const card = existing ? rowToCard(existing) : createEmptyCard(now);

	const { card: next } = scheduler.next(card, now, rating);
	const row = cardToRow(itemId, next);

	// カード更新とログ挿入を1バッチで（原子的・1往復）
	await db.batch([
		db.insert(cards).values(row).onConflictDoUpdate({ target: cards.itemId, set: row }),
		db.insert(reviewLogs).values({
			itemId,
			rating,
			reviewedAt: now.getTime(),
			correctCount: meta.correctCount,
			totalCount: meta.totalCount,
			elapsedMs: meta.elapsedMs,
			scheduledDays: next.scheduled_days,
			dueAfter: next.due.getTime()
		})
	]);

	return {
		itemId,
		rating,
		state: next.state,
		scheduledDays: next.scheduled_days,
		due: next.due.toISOString()
	};
}
