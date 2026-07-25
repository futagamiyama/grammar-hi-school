import { error } from '@sveltejs/kit';
import { load as parseYaml } from 'js-yaml';
import type { PageLoad } from './$types';

const files = import.meta.glob('/src/lib/fsrs/quizzes/*.yaml', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export type Choice = { text: string; correct: boolean };

export type ReviewQuestion = {
	id: string;
	question_type: string;
	prompt: string;
	ja?: string;
	choices: Choice[];
	answer: string;
	explanation: string;
	focus?: string[];
};

export type QuizData = {
	id: string;
	title: string;
	core_question: string;
	quiz_policy?: {
		questions_per_review?: number;
		question_selection?: string;
		choice_style?: string;
		time_limit_seconds_per_question?: number;
	};
	fsrs_rating?: Record<string, { condition: string }>;
	review_questions: ReviewQuestion[];
};

export const load: PageLoad = ({ params }) => {
	const key = `/src/lib/fsrs/quizzes/${params.id}.yaml`;
	const raw = files[key];

	if (raw === undefined) {
		throw error(404, `クイズが見つかりません: ${params.id}.yaml`);
	}

	let quiz: QuizData;
	try {
		quiz = parseYaml(raw) as QuizData;
	} catch (e) {
		throw error(500, `YAML パースエラー: ${e instanceof Error ? e.message : String(e)}`);
	}

	if (!quiz?.review_questions?.length) {
		throw error(500, `review_questions がありません: ${params.id}.yaml`);
	}

	return { quiz };
};
