// index.yaml と全 quiz YAML を読み込み、パースして提供する（サーバー専用）。
import { load as parseYaml } from 'js-yaml';

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
	type?: string;
	section?: { id: string; title: string };
	core_question: string;
	quiz_policy?: {
		questions_per_review?: number;
		question_selection?: string;
		choice_style?: string;
		time_limit_seconds_per_question?: number;
	};
	review_questions: ReviewQuestion[];
};

type IndexData = {
	title: string;
	total_items: number;
	sections: { id: string; title: string; range?: string; items: string[] }[];
};

const quizFiles = import.meta.glob('/src/lib/fsrs/quizzes/*.yaml', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const indexFiles = import.meta.glob('/src/lib/fsrs/index.yaml', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const dailyFiles = import.meta.glob('/src/lib/fsrs/daily_practice.yaml', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

// itemId -> QuizData
const quizMap = new Map<string, QuizData>();
for (const [path, raw] of Object.entries(quizFiles)) {
	const quiz = parseYaml(raw) as QuizData;
	if (quiz?.id) quizMap.set(quiz.id, quiz);
}

const indexData = parseYaml(Object.values(indexFiles)[0]) as IndexData;

// index.yaml の並び順で、かつ実在する quiz だけを対象にする（欠番 g074 などを除外）
export const orderedItemIds: string[] = indexData.sections
	.flatMap((s) => s.items)
	.filter((id) => quizMap.has(id));

export const sections = indexData.sections
	.map((s) => ({
		id: s.id,
		title: s.title,
		items: s.items.filter((id) => quizMap.has(id))
	}))
	.filter((s) => s.items.length > 0);

export const indexTitle = indexData.title;

// ---- daily_practice.yaml（当日練習メニュー決定ルール） ----
export type ProfileName = 'light' | 'normal' | 'heavy';

export type LoadProfile = {
	description: string;
	target_minutes: number;
	max_cards: number;
	max_new_items: number;
	practice_order: string[];
};

export type DailyPolicy = {
	default_profile: ProfileName;
	basic_unit?: {
		review_questions_per_card?: number;
		time_limit_seconds_per_question?: number;
	};
	daily_load_profiles: Record<ProfileName, LoadProfile>;
	selection_rules?: {
		recent_failed_items?: { lookback_days?: number };
		weak_sections?: {
			metrics?: {
				accuracy_window_days?: number;
				weak_accuracy_threshold?: number;
				slow_response_time_ratio_threshold?: number;
			};
			max_cards_per_day?: number;
		};
		new_items?: { max_new_items_by_profile?: Record<string, number> };
		mixed_judgement?: { preferred_cards?: string[]; max_cards_per_day?: number };
	};
};

export const dailyPolicy = parseYaml(Object.values(dailyFiles)[0]) as DailyPolicy;

export function getQuiz(itemId: string): QuizData | undefined {
	return quizMap.get(itemId);
}

// itemId -> セクション見出し（表示用）
export function getSectionTitle(itemId: string): string {
	for (const s of indexData.sections) {
		if (s.items.includes(itemId)) return s.title;
	}
	return '';
}
