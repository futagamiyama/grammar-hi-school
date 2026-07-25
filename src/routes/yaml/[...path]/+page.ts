import { error } from '@sveltejs/kit';
import { load as parseYaml } from 'js-yaml';
import type { PageLoad } from './$types';

// src/lib/fsrs 以下の全 YAML を生文字列として取り込む（dev/build 両対応）
const files = import.meta.glob('/src/lib/fsrs/**/*.yaml', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export const load: PageLoad = ({ params }) => {
	// 例: /yaml/contents            -> /src/lib/fsrs/contents.yaml
	//     /yaml/quizzes/g001        -> /src/lib/fsrs/quizzes/g001.yaml
	const key = `/src/lib/fsrs/${params.path}.yaml`;
	const raw = files[key];

	if (raw === undefined) {
		throw error(404, `YAML が見つかりません: ${params.path}.yaml`);
	}

	let parsed = '';
	let parseError: string | null = null;
	try {
		parsed = JSON.stringify(parseYaml(raw), null, 2);
	} catch (e) {
		parseError = e instanceof Error ? e.message : String(e);
	}

	return {
		path: `${params.path}.yaml`,
		raw,
		parsed,
		parseError,
		available: Object.keys(files)
			.map((k) => k.replace('/src/lib/fsrs/', '').replace(/\.yaml$/, ''))
			.sort()
	};
};
