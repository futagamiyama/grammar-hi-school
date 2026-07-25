<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	function daysAgo(takenAt: number): string {
		const d = Math.floor((Date.now() - takenAt) / 86_400_000);
		if (d <= 0) return '今日';
		return `${d}日前`;
	}

	// 減衰後の得点で色分け
	function scoreColor(v: number): string {
		if (v >= 80) return '#16a34a';
		if (v >= 50) return '#2563eb';
		if (v >= 30) return '#d97706';
		return '#dc2626';
	}
</script>

<svelte:head>
	<title>高校英文法マスター FSRS</title>
</svelte:head>

<main>
	<h1>高校英文法マスター FSRS</h1>
	<p class="lead">FSRS（間隔反復）で高校英文法を効率的に復習します。</p>

	<a class="start" href="/learn">FSRSによる練習をスタート</a>

	<h2 class="toc-head">目次</h2>
	<div class="toc">
		{#each data.toc as section (section.id)}
			<section class="sec">
				<h3 class="sec-head">
					<span class="sec-id">{section.id}</span>
					{section.title}
				</h3>
				<ul class="items">
					{#each section.items as item (item.id)}
						<li>
							<a href="/quiz/{item.id}">
								<span class="item-id">{item.id}</span>
								<span class="item-title">{item.title}</span>
								{#if item.score}
									<span class="score" style="color: {scoreColor(item.score.current)}">
										{item.score.current}点
									</span>
									<span class="score-sub">元 {item.score.original}・{daysAgo(item.score.takenAt)}</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</main>

<style>
	main {
		max-width: 720px;
		margin: 0 auto;
		padding: 3rem 1.5rem;
		font-family: system-ui, -apple-system, sans-serif;
		color: #1a1a1a;
	}
	h1 {
		font-size: 1.6rem;
		margin: 0 0 0.5rem;
		text-align: center;
	}
	.lead {
		color: #555;
		margin: 0 0 2rem;
		text-align: center;
	}
	.start {
		display: block;
		width: fit-content;
		margin: 0 auto 2.5rem;
		padding: 1rem 2rem;
		font-size: 1.15rem;
		font-weight: 700;
		color: #fff;
		background: #2563eb;
		border-radius: 10px;
		text-decoration: none;
		box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
	}
	.start:hover {
		background: #1d4ed8;
	}

	.toc-head {
		font-size: 1.1rem;
		margin: 0 0 1rem;
		padding-bottom: 0.4rem;
		border-bottom: 2px solid #e2e2e2;
	}
	.toc {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}
	.sec-head {
		font-size: 1.05rem;
		margin: 0 0 0.6rem;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.sec-id {
		font-size: 0.8rem;
		font-weight: 700;
		color: #fff;
		background: #334155;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
	}
	.items {
		list-style: none;
		margin: 0;
		padding: 0 0 0 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.items a {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.35rem 0.5rem;
		border-radius: 6px;
		text-decoration: none;
		color: #1a1a1a;
	}
	.items a:hover {
		background: #eff4ff;
	}
	.item-id {
		font-size: 0.78rem;
		color: #64748b;
		font-variant-numeric: tabular-nums;
		min-width: 3rem;
	}
	.item-title {
		font-size: 0.95rem;
		flex: 1;
	}
	.score {
		font-size: 0.95rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.score-sub {
		font-size: 0.7rem;
		color: #94a3b8;
		white-space: nowrap;
		min-width: 5.5rem;
		text-align: right;
	}
</style>
