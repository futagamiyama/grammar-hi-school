import type { PageServerLoad } from './$types';
import { sections, getQuiz } from '$lib/server/content';
import { getLatestScores, decayedScore } from '$lib/server/scores';

export const load: PageServerLoad = async () => {
	const latest = await getLatestScores();
	const now = Date.now();

	const toc = sections.map((s) => ({
		id: s.id,
		title: s.title,
		items: s.items.map((id) => {
			const ls = latest.get(id);
			return {
				id,
				title: getQuiz(id)?.title ?? '',
				score: ls
					? {
							current: decayedScore(ls.score, ls.takenAt, now), // 減衰後の得点
							original: ls.score, // 受験時の得点
							takenAt: ls.takenAt
						}
					: null
			};
		})
	}));

	return { toc };
};
