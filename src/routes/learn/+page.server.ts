import type { PageServerLoad } from './$types';
import { buildDailyPlan } from '$lib/server/daily';
import { getStats } from '$lib/server/fsrs';
import { getQuiz, dailyPolicy, type ProfileName } from '$lib/server/content';

const PROFILE_NAMES: ProfileName[] = ['light', 'normal', 'heavy'];

export const load: PageServerLoad = async ({ url }) => {
	const requested = url.searchParams.get('profile') as ProfileName | null;
	const profile: ProfileName =
		requested && PROFILE_NAMES.includes(requested) ? requested : dailyPolicy.default_profile;

	const plan = await buildDailyPlan(profile);

	// 練習に必要な quiz データを各カードに付与
	const cards = plan.items.map((it) => ({
		...it,
		quiz: getQuiz(it.id)!
	}));

	const profiles = PROFILE_NAMES.map((name) => ({
		name,
		description: dailyPolicy.daily_load_profiles[name].description,
		targetMinutes: dailyPolicy.daily_load_profiles[name].target_minutes,
		maxCards: dailyPolicy.daily_load_profiles[name].max_cards,
		maxNew: dailyPolicy.daily_load_profiles[name].max_new_items
	}));

	return {
		profile,
		plan: { targetMinutes: plan.targetMinutes, maxCards: plan.maxCards, counts: plan.counts },
		cards,
		profiles,
		stats: await getStats()
	};
};
