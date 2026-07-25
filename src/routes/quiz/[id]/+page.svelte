<script lang="ts">
	import type { PageData } from './$types';
	import type { ReviewQuestion } from './+page';

	let { data }: { data: PageData } = $props();

	const quiz = data.quiz;
	const timeLimitPerQ = quiz.quiz_policy?.time_limit_seconds_per_question ?? 8;

	type Phase = 'intro' | 'question' | 'answer';
	type Answered = { question: ReviewQuestion; selected: string | null; correct: boolean };

	let phase = $state<Phase>('intro');
	let questions = $state<ReviewQuestion[]>([]);
	// questionId -> 選択した choice text
	let selections = $state<Record<string, string>>({});
	let results = $state<Answered[]>([]);
	let startedAt = 0;
	let totalElapsedMs = $state(0);

	function start() {
		// 全問出題（review_questions すべて）
		questions = quiz.review_questions;
		selections = {};
		results = [];
		phase = 'question';
		startedAt = Date.now();
	}

	const allAnswered = $derived(questions.length > 0 && questions.every((q) => selections[q.id]));

	function grade() {
		if (!allAnswered) return;
		totalElapsedMs = Date.now() - startedAt;
		results = questions.map((q) => ({
			question: q,
			selected: selections[q.id] ?? null,
			correct: q.choices.some((c) => c.text === selections[q.id] && c.correct)
		}));
		phase = 'answer';
		saveScore();
	}

	// 得点を日付・quiz idとともにDBへ保存
	async function saveScore() {
		if (results.length === 0) return;
		try {
			await fetch(`/quiz/${quiz.id}/score`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ score })
			});
		} catch {
			// 保存失敗は致命的でないため無視
		}
	}

	function restart() {
		start();
	}

	// 集計
	const correctCount = $derived(results.filter((r) => r.correct).length);

	// 得点（正確さ優先）
	//   得点 = 100 × (C/N) × 速度係数
	//   速度係数: r = T/L として
	//     r ≤ 0.6         → 1.0
	//     0.6 < r < 1.0   → 1 − 0.75×(r − 0.6)   （線形）
	//     r ≥ 1.0         → 0.7
	//   ⇒ 全問正解なら遅くても 100×0.7 = 70点
	const totalLimitSec = $derived(timeLimitPerQ * results.length);
	const totalElapsedSec = $derived(totalElapsedMs / 1000);
	const timeRatio = $derived(totalLimitSec > 0 ? totalElapsedSec / totalLimitSec : 0);
	const speedCoef = $derived.by(() => {
		const r = timeRatio;
		if (r <= 0.6) return 1;
		if (r >= 1) return 0.7;
		return 1 - 0.75 * (r - 0.6);
	});
	const score = $derived(
		results.length > 0 ? Math.round(100 * (correctCount / results.length) * speedCoef) : 0
	);
</script>

<svelte:head>
	<title>Quiz: {quiz.id} {quiz.title}</title>
</svelte:head>

<main>
	<header>
		<span class="tag">{quiz.id}</span>
		<h1>{quiz.title}</h1>
	</header>

	{#if phase === 'intro'}
		<section class="card">
			<p class="core">核心の問い：{quiz.core_question}</p>
			<ul class="policy">
				<li>出題数：全 {quiz.review_questions.length} 問</li>
				<li>形式：2択・全問一斉回答</li>
			</ul>
			<button class="primary" onclick={start}>クイズを開始</button>
		</section>
	{/if}

	{#if phase === 'question'}
		<section class="card">
			<div class="badge">質問（全 {questions.length} 問）</div>
			{#each questions as q, qi (q.id)}
				<div class="q-block">
					<p class="q-prompt"><span class="q-num">{qi + 1}.</span> {q.prompt}</p>
					<div class="q-choices">
						{#each q.choices as choice (choice.text)}
							<label class="opt">
								<input
									type="radio"
									name={q.id}
									value={choice.text}
									checked={selections[q.id] === choice.text}
									onchange={() => (selections[q.id] = choice.text)}
								/>
								<span>{choice.text}</span>
							</label>
						{/each}
					</div>
				</div>
			{/each}
			<button class="primary" disabled={!allAnswered} onclick={grade}>
				{allAnswered ? '採点する' : 'すべての問題に回答してください'}
			</button>
		</section>
	{/if}

	{#if phase === 'answer'}
		<section class="card">
			<div class="badge">回答（全 {results.length} 問）</div>
			<div class="score-box">
				<div class="score-num">{score}<small>点</small></div>
				<div class="score-detail">
					正解 {correctCount} / {results.length}
					<span class="dot">・</span>
					回答 {totalElapsedSec.toFixed(1)}秒 / 制限 {totalLimitSec}秒
					{#if speedCoef < 1}<span class="over">速度係数 ×{speedCoef.toFixed(2)}</span>{/if}
				</div>
			</div>

			{#each results as r, i (r.question.id)}
				<div class="q-block">
					<p class="q-prompt">
						<span class="q-num">{i + 1}.</span> {r.question.prompt}
						<span class="q-verdict">{r.correct ? '✅ 正解' : '❌ 不正解'}</span>
					</p>
					<div class="q-choices">
						{#each r.question.choices as choice (choice.text)}
							<div class="opt-result">
								<span class="mark">{choice.correct ? '✅' : choice.text === r.selected ? '❌' : ''}</span>
								<span>{choice.text}</span>
								{#if choice.text === r.selected}<span class="picked">あなたの選択</span>{/if}
							</div>
						{/each}
					</div>
					{#if r.question.ja}<p class="q-ja">{r.question.ja}</p>{/if}
					<p class="q-exp">{r.question.explanation}</p>
				</div>
			{/each}

			<div class="actions">
				<button class="primary" onclick={restart}>もう一度</button>
				<a class="secondary" href="/">目次に戻る</a>
			</div>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 640px;
		margin: 0 auto;
		padding: 1.5rem;
		font-family: system-ui, -apple-system, sans-serif;
		color: #1a1a1a;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1.2rem;
	}
	.tag {
		background: #1a1a1a;
		color: #fff;
		font-size: 0.75rem;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
	}
	h1 {
		font-size: 1.2rem;
		margin: 0;
	}
	.card {
		border: 1px solid #e2e2e2;
		border-radius: 12px;
		padding: 1.5rem;
		background: #fff;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
	}
	.badge {
		display: inline-block;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: #666;
		margin-bottom: 1rem;
	}
	.core {
		font-weight: 600;
		margin: 0 0 1rem;
	}
	.policy {
		margin: 0 0 1.4rem;
		padding-left: 1.2rem;
		color: #444;
		font-size: 0.9rem;
		line-height: 1.8;
	}

	.q-block {
		padding: 1rem 0;
		border-top: 1px solid #eee;
	}
	.q-block:first-of-type {
		border-top: none;
		padding-top: 0;
	}
	.q-prompt {
		font-size: 1.15rem;
		line-height: 1.6;
		margin: 0 0 0.8rem;
	}
	.q-num {
		font-weight: 700;
		color: #64748b;
		margin-right: 0.2rem;
	}
	.q-verdict {
		font-size: 0.9rem;
		font-weight: 700;
		margin-left: 0.5rem;
		white-space: nowrap;
	}
	.q-choices {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.opt {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.8rem;
		border: 2px solid #d0d0d0;
		border-radius: 8px;
		background: #fafafa;
		cursor: pointer;
		font-size: 1.05rem;
	}
	.opt:hover {
		border-color: #2563eb;
		background: #eff4ff;
	}
	.opt input {
		width: 1.1rem;
		height: 1.1rem;
		cursor: pointer;
	}

	.opt-result {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.2rem;
		font-size: 1.1rem;
	}
	.mark {
		width: 1.5rem;
		display: inline-block;
		text-align: center;
	}
	.picked {
		font-size: 0.72rem;
		color: #666;
		background: #eee;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
	}
	.q-ja {
		color: #555;
		font-size: 0.92rem;
		margin: 0.6rem 0 0;
	}
	.q-exp {
		background: #f6f6f6;
		border-radius: 8px;
		padding: 0.8rem 1rem;
		font-size: 0.9rem;
		line-height: 1.7;
		color: #333;
		margin: 0.7rem 0 0;
		white-space: pre-wrap;
	}

	.score-box {
		text-align: center;
		padding: 1rem;
		margin-bottom: 1.2rem;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
	}
	.score-num {
		font-size: 2.6rem;
		font-weight: 800;
		line-height: 1;
		color: #2563eb;
	}
	.score-num small {
		font-size: 1rem;
		font-weight: 700;
		margin-left: 0.15rem;
	}
	.score-detail {
		margin-top: 0.5rem;
		font-size: 0.9rem;
		color: #555;
	}
	.dot {
		color: #cbd5e1;
	}
	.over {
		color: #dc2626;
		font-weight: 600;
		margin-left: 0.4rem;
	}

	.primary {
		display: block;
		width: 100%;
		margin-top: 1.2rem;
		padding: 0.9rem;
		font-size: 1.05rem;
		font-weight: 600;
		color: #fff;
		background: #2563eb;
		border: none;
		border-radius: 8px;
		cursor: pointer;
	}
	.primary:hover:not(:disabled) {
		background: #1d4ed8;
	}
	.primary:disabled {
		background: #9ca3af;
		cursor: default;
	}

	.actions {
		display: flex;
		gap: 0.8rem;
		margin-top: 1.2rem;
	}
	.actions .primary {
		margin-top: 0;
		flex: 1;
	}
	.secondary {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.9rem;
		font-size: 1.05rem;
		font-weight: 600;
		color: #2563eb;
		background: #fff;
		border: 2px solid #2563eb;
		border-radius: 8px;
		text-decoration: none;
	}
	.secondary:hover {
		background: #eff4ff;
	}
</style>
