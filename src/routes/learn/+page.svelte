<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import QuizSession, { type SessionResult } from './QuizSession.svelte';

	let { data }: { data: PageData } = $props();

	type Phase = 'menu' | 'practice' | 'summary';
	let phase = $state<Phase>('menu');
	let pos = $state(0);
	let sessionResults = $state<SessionResult[]>([]);
	let nextDueCount = $state<number | null>(null);

	const profileLabel: Record<string, string> = { light: '軽め', normal: '通常', heavy: 'しっかり' };
	const ratingLabel: Record<number, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

	function changeProfile(name: string) {
		goto(`/learn?profile=${name}`, { invalidateAll: true, keepFocus: true, noScroll: true });
	}

	// サマリーからメニューへ戻る（プランを再計算し、状態をリセット）
	async function backToMenu() {
		await goto(`/learn?profile=${data.profile}`, { invalidateAll: true, noScroll: true });
		sessionResults = [];
		pos = 0;
		nextDueCount = null;
		phase = 'menu';
	}

	function start() {
		pos = 0;
		sessionResults = [];
		phase = 'practice';
	}

	async function handleComplete(r: SessionResult) {
		sessionResults.push(r);
		if (pos + 1 < data.cards.length) {
			pos += 1;
		} else {
			try {
				const res = await fetch('/learn/stats');
				nextDueCount = res.ok ? (await res.json()).dueCount : null;
			} catch {
				nextDueCount = null;
			}
			phase = 'summary';
		}
	}

	// サマリー集計
	const totalCorrect = $derived(sessionResults.reduce((s, r) => s + r.correct, 0));
	const totalQuestions = $derived(sessionResults.reduce((s, r) => s + r.total, 0));
	const totalElapsed = $derived(sessionResults.reduce((s, r) => s + r.elapsedMs, 0));
	const accuracy = $derived(totalQuestions ? totalCorrect / totalQuestions : 0);
	const avgResponse = $derived(totalQuestions ? totalElapsed / totalQuestions : 0);
	const ratingCounts = $derived.by(() => {
		const c = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<number, number>;
		for (const r of sessionResults) c[r.rating]++;
		return c;
	});
	const weakestSection = $derived.by(() => {
		const bySec = new Map<string, { correct: number; total: number }>();
		for (const r of sessionResults) {
			const s = bySec.get(r.section) ?? { correct: 0, total: 0 };
			s.correct += r.correct;
			s.total += r.total;
			bySec.set(r.section, s);
		}
		let worst: { section: string; acc: number } | null = null;
		for (const [section, s] of bySec) {
			const acc = s.total ? s.correct / s.total : 1;
			if (!worst || acc < worst.acc) worst = { section, acc };
		}
		return worst;
	});

	const counts = $derived(data.plan.counts);
</script>

<svelte:head>
	<title>FSRS 練習</title>
</svelte:head>

<main>
	{#if phase === 'menu'}
		<h1>今日の練習メニュー</h1>

		<div class="profiles">
			{#each data.profiles as p (p.name)}
				<button
					class="profile"
					class:active={p.name === data.profile}
					onclick={() => changeProfile(p.name)}
				>
					<span class="pname">{profileLabel[p.name] ?? p.name}</span>
					<span class="pdesc">{p.description}</span>
					<span class="pmeta">最大 {p.maxCards} 枚・新規 {p.maxNew}・目安 {p.targetMinutes}分</span>
				</button>
			{/each}
		</div>

		<section class="plan">
			<div class="plan-head">
				<span>本日の対象：<strong>{data.cards.length}</strong> 枚</span>
				<span class="muted">目安 {data.plan.targetMinutes} 分</span>
			</div>
			<div class="breakdown">
				<span>期限切れ {counts.overdue}</span>
				<span>本日復習 {counts.dueToday}</span>
				<span>直近ミス {counts.recentFailed}</span>
				<span>苦手候補 {counts.weakCandidates}</span>
				<span>新規のこり {counts.newRemaining}</span>
			</div>

			{#if data.cards.length === 0}
				<p class="empty">
					今日出題する対象カードはありません。<br />
					（復習期限が来ておらず、このプロファイルでは新規も追加されません）
				</p>
			{:else}
				<ol class="card-list">
					{#each data.cards as c (c.id)}
						<li>
							<span class="li-tag">{c.id}</span>
							<span class="li-title">{c.quiz.title}</span>
							<span class="li-reason">{c.reasonLabel}</span>
						</li>
					{/each}
				</ol>
				<button class="primary" onclick={start}>練習を開始</button>
			{/if}
		</section>

		<a class="link" href="/">ホームへ戻る</a>
	{/if}

	{#if phase === 'practice'}
		{#key data.cards[pos].id}
			<QuizSession
				card={data.cards[pos]}
				position={{ index: pos, total: data.cards.length }}
				onComplete={handleComplete}
			/>
		{/key}
	{/if}

	{#if phase === 'summary'}
		<section class="card center">
			<div class="emoji">🎉</div>
			<h1>本日の練習おつかれさまでした</h1>

			<dl class="summary">
				<div><dt>学習カード</dt><dd>{sessionResults.length} 枚</dd></div>
				<div><dt>出題数</dt><dd>{totalQuestions} 問</dd></div>
				<div><dt>正答率</dt><dd>{(accuracy * 100).toFixed(0)}%（{totalCorrect}/{totalQuestions}）</dd></div>
				<div><dt>平均解答時間</dt><dd>{(avgResponse / 1000).toFixed(1)} 秒/問</dd></div>
				<div>
					<dt>評価の内訳</dt>
					<dd>
						Again {ratingCounts[1]}・Hard {ratingCounts[2]}・Good {ratingCounts[3]}・Easy {ratingCounts[4]}
					</dd>
				</div>
				{#if weakestSection}
					<div><dt>本日の弱点</dt><dd>{weakestSection.section}（{(weakestSection.acc * 100).toFixed(0)}%）</dd></div>
				{/if}
				{#if nextDueCount !== null}
					<div><dt>次の復習待ち</dt><dd>{nextDueCount} 枚</dd></div>
				{/if}
			</dl>

			<button class="primary" onclick={backToMenu}>メニューに戻る</button>
			<a class="link" href="/">ホームへ戻る</a>
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
	h1 {
		font-size: 1.35rem;
		margin: 0 0 1rem;
	}

	.profiles {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.6rem;
		margin-bottom: 1.2rem;
	}
	.profile {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.7rem;
		border: 2px solid #d0d0d0;
		border-radius: 10px;
		background: #fafafa;
		cursor: pointer;
		text-align: left;
	}
	.profile.active {
		border-color: #2563eb;
		background: #eff4ff;
	}
	.pname {
		font-weight: 700;
		font-size: 0.95rem;
	}
	.pdesc {
		font-size: 0.72rem;
		color: #555;
		line-height: 1.4;
	}
	.pmeta {
		font-size: 0.68rem;
		color: #777;
	}

	.plan {
		border: 1px solid #e2e2e2;
		border-radius: 12px;
		padding: 1.2rem;
		background: #fff;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
	}
	.plan-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 1.05rem;
		margin-bottom: 0.6rem;
	}
	.muted {
		color: #888;
		font-size: 0.85rem;
	}
	.breakdown {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}
	.breakdown span {
		font-size: 0.75rem;
		background: #f1f5f9;
		color: #334155;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
	}
	.empty {
		color: #666;
		line-height: 1.8;
		text-align: center;
		margin: 1rem 0;
	}
	.card-list {
		list-style: none;
		padding: 0;
		margin: 0 0 1.2rem;
		max-height: 44vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.card-list li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.6rem;
		background: #fafafa;
		border-radius: 6px;
	}
	.li-tag {
		background: #1a1a1a;
		color: #fff;
		font-size: 0.7rem;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		flex-shrink: 0;
	}
	.li-title {
		flex: 1;
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.li-reason {
		font-size: 0.7rem;
		color: #3730a3;
		background: #eef2ff;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		flex-shrink: 0;
	}

	.card {
		border: 1px solid #e2e2e2;
		border-radius: 12px;
		padding: 2rem 1.5rem;
		background: #fff;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
	}
	.center {
		text-align: center;
	}
	.emoji {
		font-size: 3rem;
	}
	.summary {
		text-align: left;
		display: inline-block;
		margin: 1rem auto 1.5rem;
	}
	.summary div {
		display: flex;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid #f0f0f0;
	}
	.summary dt {
		color: #666;
		font-size: 0.9rem;
	}
	.summary dd {
		margin: 0;
		font-weight: 600;
		font-size: 0.95rem;
	}

	.primary {
		display: block;
		width: 100%;
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
	.link {
		display: block;
		text-align: center;
		margin-top: 0.9rem;
		color: #2563eb;
		font-size: 0.9rem;
	}
</style>
