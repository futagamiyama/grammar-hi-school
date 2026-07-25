<script lang="ts">
	type Choice = { text: string; correct: boolean };
	type ReviewQuestion = {
		id: string;
		prompt: string;
		ja?: string;
		choices: Choice[];
		answer: string;
		explanation: string;
	};
	type Quiz = {
		id: string;
		title: string;
		core_question: string;
		quiz_policy?: {
			questions_per_review?: number;
			question_selection?: string;
			time_limit_seconds_per_question?: number;
		};
		review_questions: ReviewQuestion[];
	};
	export type SessionResult = {
		itemId: string;
		section: string;
		rating: number;
		correct: number;
		total: number;
		elapsedMs: number;
	};
	type Card = { id: string; reason: string; reasonLabel: string; section: string; quiz: Quiz };

	let {
		card,
		position,
		onComplete
	}: {
		card: Card;
		position: { index: number; total: number };
		onComplete: (r: SessionResult) => void;
	} = $props();

	const quiz = card.quiz;
	const numQuestions = quiz.quiz_policy?.questions_per_review ?? 3;
	const timeLimitMs = (quiz.quiz_policy?.time_limit_seconds_per_question ?? 8) * 1000;

	type Phase = 'question' | 'answer' | 'rate' | 'result';
	type Answered = { question: ReviewQuestion; selected: string; correct: boolean; elapsedMs: number };

	let phase = $state<Phase>('question');
	let index = $state(0);
	let results = $state<Answered[]>([]);
	let selected = $state<string | null>(null);
	let lastElapsedMs = $state(0);
	let startedAt = 0;

	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let rateResult = $state<{ rating: number; scheduledDays: number; due: string } | null>(null);

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	const pool =
		quiz.quiz_policy?.question_selection === 'random' ? shuffle(quiz.review_questions) : quiz.review_questions;
	const questions = pool.slice(0, Math.min(numQuestions, pool.length));
	startedAt = Date.now();

	const current = $derived(questions[index]);

	function isCorrectChoice(text: string) {
		return current.choices.some((c) => c.text === text && c.correct);
	}

	function reveal(choiceText: string) {
		if (phase !== 'question') return;
		selected = choiceText;
		lastElapsedMs = Date.now() - startedAt;
		const correct = current.choices.some((c) => c.text === choiceText && c.correct);
		results.push({ question: current, selected: choiceText, correct, elapsedMs: lastElapsedMs });
		phase = 'answer';
	}

	function next() {
		if (index + 1 < questions.length) {
			index += 1;
			selected = null;
			startedAt = Date.now();
			phase = 'question';
		} else {
			phase = 'rate';
		}
	}

	const correctCount = $derived(results.filter((r) => r.correct).length);
	const missCount = $derived(results.filter((r) => !r.correct).length);
	const totalElapsedMs = $derived(results.reduce((s, r) => s + r.elapsedMs, 0));
	const avgMs = $derived(results.length ? totalElapsedMs / results.length : 0);
	const maxMs = $derived(results.reduce((m, r) => Math.max(m, r.elapsedMs), 0));

	// AGAIN=1, HARD=2, GOOD=3, EASY=4（daily_practice.yaml の rating_rules に一致）
	const recommended = $derived.by(() => {
		if (missCount >= 2) return 1;
		if (missCount === 1) return 2;
		const easy = avgMs <= timeLimitMs * 0.6 && maxMs <= timeLimitMs * 0.85;
		return easy ? 4 : 3;
	});

	const ratingMeta: Record<number, { label: string; color: string }> = {
		1: { label: 'もう一度 (Again)', color: '#dc2626' },
		2: { label: '難しい (Hard)', color: '#d97706' },
		3: { label: 'できた (Good)', color: '#2563eb' },
		4: { label: '簡単 (Easy)', color: '#16a34a' }
	};

	async function submit(rating: number) {
		submitting = true;
		submitError = null;
		try {
			const res = await fetch('/learn/rate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					itemId: card.id,
					rating,
					correctCount,
					totalCount: results.length,
					elapsedMs: totalElapsedMs
				})
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message ?? `HTTP ${res.status}`);
			const data = await res.json();
			rateResult = { rating, scheduledDays: data.scheduledDays, due: data.due };
			phase = 'result';
		} catch (e) {
			submitError = e instanceof Error ? e.message : String(e);
		} finally {
			submitting = false;
		}
	}

	function finishCard() {
		onComplete({
			itemId: card.id,
			section: card.section,
			rating: rateResult!.rating,
			correct: correctCount,
			total: results.length,
			elapsedMs: totalElapsedMs
		});
	}

	function formatInterval(dueIso: string): string {
		const ms = new Date(dueIso).getTime() - Date.now();
		const min = Math.round(ms / 60000);
		if (min < 60) return `約 ${Math.max(1, min)} 分後`;
		const hours = Math.round(min / 60);
		if (hours < 24) return `約 ${hours} 時間後`;
		return `約 ${Math.round(hours / 24)} 日後`;
	}
</script>

<div class="topbar">
	<span class="count">カード {position.index + 1} / {position.total}</span>
	<span class="reason">{card.reasonLabel}</span>
</div>

<header>
	<span class="tag">{card.id}</span>
	<h1>{quiz.title}</h1>
</header>
<p class="section">{card.section}／{quiz.core_question}</p>

{#if phase === 'question' && current}
	<div class="progress">問 {index + 1} / {questions.length}</div>
	<section class="card">
		<div class="badge">質問</div>
		<p class="prompt">{current.prompt}</p>
		<div class="choices">
			{#each current.choices as choice (choice.text)}
				<button class="choice" onclick={() => reveal(choice.text)}>{choice.text}</button>
			{/each}
		</div>
	</section>
{/if}

{#if phase === 'answer' && current}
	<div class="progress">問 {index + 1} / {questions.length}</div>
	<section class="card">
		<div class="badge">回答</div>
		<div class="verdict-row">
			<span class="verdict">
				{#if selected !== null && isCorrectChoice(selected)}✅ 正解{:else}❌ 不正解{/if}
			</span>
			<span class="time">{(lastElapsedMs / 1000).toFixed(1)}秒 / {timeLimitMs / 1000}秒</span>
		</div>
		<p class="prompt">{current.prompt}</p>
		<div class="choices">
			{#each current.choices as choice (choice.text)}
				<div class="choice-result">
					<span class="mark">{choice.correct ? '✅' : ''}</span>
					<span>{choice.text}</span>
				</div>
			{/each}
		</div>
		{#if current.ja}<p class="ja">{current.ja}</p>{/if}
		<p class="explanation">{current.explanation}</p>
		<button class="primary" onclick={next}>
			{index + 1 < questions.length ? '次の問題へ' : '評価へ'}
		</button>
	</section>
{/if}

{#if phase === 'rate'}
	<section class="card">
		<div class="badge">評価</div>
		<div class="score">{correctCount} / {results.length} 正解</div>
		<p class="rate-hint">
			平均 {(avgMs / 1000).toFixed(1)}秒・最遅 {(maxMs / 1000).toFixed(1)}秒。
			推奨は <strong style="color: {ratingMeta[recommended].color}">{ratingMeta[recommended].label}</strong> です。
		</p>
		<div class="rate-buttons">
			{#each [1, 2, 3, 4] as r (r)}
				<button
					class="rate-btn"
					class:recommended={r === recommended}
					style="--c: {ratingMeta[r].color}"
					disabled={submitting}
					onclick={() => submit(r)}
				>
					{ratingMeta[r].label}
					{#if r === recommended}<span class="rec">推奨</span>{/if}
				</button>
			{/each}
		</div>
		{#if submitError}<p class="err">送信エラー: {submitError}</p>{/if}
	</section>
{/if}

{#if phase === 'result' && rateResult}
	<section class="card">
		<div class="badge">登録完了</div>
		<p class="done-line">
			評価 <strong style="color: {ratingMeta[rateResult.rating].color}">{ratingMeta[rateResult.rating].label}</strong>
			で登録しました。
		</p>
		<p class="next-due">次回の出題予定：<strong>{formatInterval(rateResult.due)}</strong></p>
		<button class="primary" onclick={finishCard}>
			{position.index + 1 < position.total ? '次のカードへ' : '結果を見る'}
		</button>
	</section>
{/if}

<style>
	.topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.8rem;
	}
	.count {
		font-size: 0.85rem;
		color: #666;
	}
	.reason {
		font-size: 0.75rem;
		font-weight: 700;
		color: #3730a3;
		background: #eef2ff;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
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
	.section {
		color: #666;
		font-size: 0.85rem;
		margin: 0.3rem 0 1.2rem;
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
		margin-bottom: 0.8rem;
	}
	.progress {
		font-size: 0.85rem;
		color: #666;
		margin-bottom: 0.5rem;
	}
	.prompt {
		font-size: 1.25rem;
		line-height: 1.6;
		margin: 0.4rem 0 1.4rem;
	}
	.choices {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.choice {
		font-size: 1.05rem;
		padding: 0.9rem 1rem;
		border: 2px solid #d0d0d0;
		border-radius: 8px;
		background: #fafafa;
		cursor: pointer;
		text-align: left;
	}
	.choice:hover {
		border-color: #2563eb;
		background: #eff4ff;
	}
	.choice-result {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.2rem;
		font-size: 1.15rem;
	}
	.mark {
		width: 1.6rem;
		display: inline-block;
		text-align: center;
	}
	.verdict-row {
		display: flex;
		align-items: baseline;
		gap: 0.9rem;
		margin-bottom: 1rem;
	}
	.verdict {
		font-size: 1.3rem;
		font-weight: 700;
	}
	.time {
		font-size: 0.95rem;
		color: #666;
	}
	.ja {
		color: #555;
		font-size: 0.95rem;
		margin: 0.4rem 0 0;
	}
	.explanation {
		background: #f6f6f6;
		border-radius: 8px;
		padding: 0.9rem 1rem;
		font-size: 0.92rem;
		line-height: 1.7;
		color: #333;
		margin: 1rem 0 1.4rem;
		white-space: pre-wrap;
	}
	.primary {
		display: block;
		width: 100%;
		margin-top: 0.4rem;
		padding: 0.9rem;
		font-size: 1.05rem;
		font-weight: 600;
		color: #fff;
		background: #2563eb;
		border: none;
		border-radius: 8px;
		cursor: pointer;
	}
	.primary:hover {
		background: #1d4ed8;
	}
	.score {
		font-size: 2rem;
		font-weight: 800;
		text-align: center;
		margin: 0.3rem 0 0.6rem;
	}
	.rate-hint {
		text-align: center;
		font-size: 0.9rem;
		color: #555;
		margin: 0 0 1.2rem;
		line-height: 1.7;
	}
	.rate-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
	}
	.rate-btn {
		position: relative;
		padding: 0.9rem;
		font-size: 1rem;
		font-weight: 600;
		color: var(--c);
		background: #fff;
		border: 2px solid var(--c);
		border-radius: 8px;
		cursor: pointer;
	}
	.rate-btn:hover {
		background: color-mix(in srgb, var(--c) 10%, white);
	}
	.rate-btn.recommended {
		color: #fff;
		background: var(--c);
	}
	.rate-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.rec {
		display: block;
		font-size: 0.65rem;
		margin-top: 0.15rem;
	}
	.done-line {
		font-size: 1.05rem;
		margin: 0.3rem 0 0.6rem;
	}
	.next-due {
		font-size: 1rem;
		color: #333;
		margin: 0 0 1.4rem;
	}
	.err {
		color: #dc2626;
		font-size: 0.9rem;
		margin-top: 0.8rem;
	}
</style>
