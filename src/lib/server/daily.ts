// daily_practice.yaml のルールに従って「その日に練習するカード群」を選定する。
import { client } from './db';
import {
	dailyPolicy,
	orderedItemIds,
	getSectionTitle,
	getQuiz,
	type ProfileName
} from './content';

export type ReasonKey =
	| 'overdue_reviews'
	| 'due_today_reviews'
	| 'recent_failed_items'
	| 'weak_sections'
	| 'new_items'
	| 'mixed_judgement';

export const reasonLabels: Record<ReasonKey, string> = {
	overdue_reviews: '期限切れ復習',
	due_today_reviews: '本日復習',
	recent_failed_items: '直近ミス',
	weak_sections: '苦手補強',
	new_items: '新規学習',
	mixed_judgement: '総合判定'
};

export type PlannedCard = { id: string; reason: ReasonKey; reasonLabel: string; section: string };

export type DailyPlan = {
	profile: ProfileName;
	targetMinutes: number;
	maxCards: number;
	maxNew: number;
	items: PlannedCard[];
	counts: {
		overdue: number;
		dueToday: number;
		recentFailed: number;
		weakCandidates: number;
		newRemaining: number;
	};
};

type CardRow = { item_id: string; due: number; state: number; last_review: number | null };
type LatestLog = { item_id: string; rating: number; reviewed_at: number; correct_count: number; total_count: number };

const DAY_MS = 86_400_000;

function startOfToday(now: number): number {
	const d = new Date(now);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

async function getCardRows(): Promise<CardRow[]> {
	const rs = await client.execute('SELECT item_id, due, state, last_review FROM cards');
	return rs.rows as unknown as CardRow[];
}

async function getLatestLogs(): Promise<Map<string, LatestLog>> {
	const rs = await client.execute(
		`SELECT rl.item_id, rl.rating, rl.reviewed_at, rl.correct_count, rl.total_count
		 FROM review_logs rl
		 JOIN (SELECT item_id, MAX(reviewed_at) mx FROM review_logs GROUP BY item_id) t
		   ON rl.item_id = t.item_id AND rl.reviewed_at = t.mx`
	);
	const rows = rs.rows as unknown as LatestLog[];
	return new Map(rows.map((r) => [r.item_id, r]));
}

async function yesterdayAccuracy(todayStart: number): Promise<number | null> {
	const rs = await client.execute({
		sql: 'SELECT SUM(correct_count) c, SUM(total_count) t FROM review_logs WHERE reviewed_at >= ? AND reviewed_at < ?',
		args: [todayStart - DAY_MS, todayStart]
	});
	const row = rs.rows[0] as unknown as { c: number | null; t: number | null };
	if (!row?.t) return null;
	return (row.c ?? 0) / row.t;
}

// 直近 window 日のログからセクション別・カード別の正答率と平均解答時間比を出す
async function computeWeakCards(
	windowDays: number,
	limitMs: number
): Promise<{ cards: string[]; count: number }> {
	const since = Date.now() - windowDays * DAY_MS;
	const rs = await client.execute({
		sql: 'SELECT item_id, correct_count, total_count, elapsed_ms FROM review_logs WHERE reviewed_at >= ?',
		args: [since]
	});
	const rows = rs.rows as unknown as {
		item_id: string;
		correct_count: number;
		total_count: number;
		elapsed_ms: number;
	}[];

	const weakRules = dailyPolicy.selection_rules?.weak_sections?.metrics ?? {};
	const accThreshold = weakRules.weak_accuracy_threshold ?? 0.8;
	const timeRatioThreshold = weakRules.slow_response_time_ratio_threshold ?? 0.85;

	const bySection = new Map<string, { correct: number; total: number; elapsed: number }>();
	const byCard = new Map<string, { correct: number; total: number; elapsed: number }>();

	for (const r of rows) {
		const sec = getSectionTitle(r.item_id);
		const s = bySection.get(sec) ?? { correct: 0, total: 0, elapsed: 0 };
		s.correct += r.correct_count;
		s.total += r.total_count;
		s.elapsed += r.elapsed_ms;
		bySection.set(sec, s);

		const c = byCard.get(r.item_id) ?? { correct: 0, total: 0, elapsed: 0 };
		c.correct += r.correct_count;
		c.total += r.total_count;
		c.elapsed += r.elapsed_ms;
		byCard.set(r.item_id, c);
	}

	const weakSections = new Set<string>();
	for (const [sec, s] of bySection) {
		if (s.total === 0) continue;
		const acc = s.correct / s.total;
		const timeRatio = s.elapsed / s.total / limitMs;
		if (acc < accThreshold || timeRatio > timeRatioThreshold) weakSections.add(sec);
	}

	// 苦手セクション内のカードを、正答率が低い順に候補化
	const candidates = [...byCard.entries()]
		.filter(([id]) => weakSections.has(getSectionTitle(id)))
		.sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
		.map(([id]) => id);

	return { cards: candidates, count: candidates.length };
}

export async function buildDailyPlan(profileName: ProfileName, now = Date.now()): Promise<DailyPlan> {
	const profile = dailyPolicy.daily_load_profiles[profileName];
	const maxCards = profile.max_cards;
	const maxNew = profile.max_new_items;
	const order = profile.practice_order as ReasonKey[];

	const todayStart = startOfToday(now);
	const tomorrowStart = todayStart + DAY_MS;
	const limitMs = (dailyPolicy.basic_unit?.time_limit_seconds_per_question ?? 8) * 1000;
	const lookbackDays = dailyPolicy.selection_rules?.recent_failed_items?.lookback_days ?? 3;
	const weakMax = dailyPolicy.selection_rules?.weak_sections?.max_cards_per_day ?? 4;
	const mixedCfg = dailyPolicy.selection_rules?.mixed_judgement;
	const mixedMax = mixedCfg?.max_cards_per_day ?? 2;
	const preferredMixed = mixedCfg?.preferred_cards ?? [];

	const cardRows = await getCardRows();
	const latest = await getLatestLogs();
	const introduced = new Set(cardRows.map((r) => r.item_id));

	// 各カテゴリの候補
	const overdue = cardRows
		.filter((r) => r.state !== 0 && r.due < todayStart)
		.sort((a, b) => a.due - b.due) // oldest_due_date_first
		.map((r) => r.item_id);

	const dueToday = cardRows
		.filter((r) => r.state !== 0 && r.due >= todayStart && r.due < tomorrowStart)
		.sort((a, b) => a.due - b.due)
		.map((r) => r.item_id);

	const recentFailed = [...latest.values()]
		.filter(
			(l) =>
				(l.rating === 1 || l.rating === 2) && // AGAIN / HARD
				l.reviewed_at >= todayStart - lookbackDays * DAY_MS
		)
		.sort((a, b) => a.reviewed_at - b.reviewed_at)
		.map((l) => l.item_id);

	const weak = await computeWeakCards(
		dailyPolicy.selection_rules?.weak_sections?.metrics?.accuracy_window_days ?? 7,
		limitMs
	);

	const newQueue = orderedItemIds.filter((id) => !introduced.has(id));

	const yAcc = await yesterdayAccuracy(todayStart);

	// プランを組み立て
	const chosen = new Set<string>();
	const items: PlannedCard[] = [];
	const add = (id: string, reason: ReasonKey) => {
		if (chosen.has(id) || items.length >= maxCards || !getQuiz(id)) return;
		chosen.add(id);
		items.push({ id, reason, reasonLabel: reasonLabels[reason], section: getSectionTitle(id) });
	};

	for (const cat of order) {
		if (cat === 'overdue_reviews') {
			overdue.forEach((id) => add(id, 'overdue_reviews'));
		} else if (cat === 'due_today_reviews') {
			dueToday.forEach((id) => add(id, 'due_today_reviews'));
		} else if (cat === 'recent_failed_items') {
			recentFailed.forEach((id) => add(id, 'recent_failed_items'));
		} else if (cat === 'weak_sections') {
			let c = 0;
			for (const id of weak.cards) {
				if (c >= weakMax) break;
				if (!chosen.has(id)) {
					add(id, 'weak_sections');
					c++;
				}
			}
		} else if (cat === 'new_items') {
			// skip_if: profile==light / overdue>10 / yesterday_accuracy<0.70
			const skip = profileName === 'light' || overdue.length > 10 || (yAcc !== null && yAcc < 0.7);
			if (!skip) {
				let n = 0;
				for (const id of newQueue) {
					if (n >= maxNew) break;
					if (!chosen.has(id)) {
						add(id, 'new_items');
						n++;
					}
				}
			}
		} else if (cat === 'mixed_judgement') {
			const dueRemaining = overdue.length + dueToday.length;
			if (profileName === 'heavy' && dueRemaining === 0 && recentFailed.length <= 2) {
				let m = 0;
				for (const id of preferredMixed) {
					if (m >= mixedMax) break;
					if (!chosen.has(id) && getQuiz(id)) {
						add(id, 'mixed_judgement');
						m++;
					}
				}
			}
		}
	}

	return {
		profile: profileName,
		targetMinutes: profile.target_minutes,
		maxCards,
		maxNew,
		items,
		counts: {
			overdue: overdue.length,
			dueToday: dueToday.length,
			recentFailed: recentFailed.length,
			weakCandidates: weak.count,
			newRemaining: newQueue.length
		}
	};
}
