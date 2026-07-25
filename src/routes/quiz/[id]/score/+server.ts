import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveScore } from '$lib/server/scores';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json().catch(() => ({}));
	const score = Number(body?.score);

	if (!Number.isFinite(score) || score < 0 || score > 100) {
		throw error(400, 'score は 0〜100 の数値が必要です');
	}

	await saveScore(params.id, Math.round(score), Date.now());
	return json({ ok: true });
};
