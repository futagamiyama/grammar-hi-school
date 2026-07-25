import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyRating } from '$lib/server/fsrs';
import type { Grade } from 'ts-fsrs';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { itemId, rating, correctCount, totalCount, elapsedMs } = body ?? {};

	if (typeof itemId !== 'string' || ![1, 2, 3, 4].includes(rating)) {
		throw error(400, 'itemId と rating(1-4) が必要です');
	}

	const result = await applyRating(itemId, rating as Grade, {
		correctCount: Number(correctCount) || 0,
		totalCount: Number(totalCount) || 0,
		elapsedMs: Number(elapsedMs) || 0
	});

	return json(result);
};
