import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStats } from '$lib/server/fsrs';

export const GET: RequestHandler = async () => {
	return json(await getStats());
};
