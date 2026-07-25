<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>YAML: {data.path}</title>
</svelte:head>

<main>
	<h1>{data.path}</h1>

	<nav class="links">
		{#each data.available as name (name)}
			<a href="/yaml/{name}" class:active={`${name}.yaml` === data.path}>{name}</a>
		{/each}
	</nav>

	<div class="grid">
		<section>
			<h2>文字列（raw）</h2>
			<pre>{data.raw}</pre>
		</section>

		<section>
			<h2>パース結果（JSON）</h2>
			{#if data.parseError}
				<pre class="error">パースエラー:
{data.parseError}</pre>
			{:else}
				<pre>{data.parsed}</pre>
			{/if}
		</section>
	</div>
</main>

<style>
	main {
		max-width: 1400px;
		margin: 0 auto;
		padding: 1.5rem;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}

	h1 {
		font-size: 1.3rem;
		margin: 0 0 1rem;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1.5rem;
	}

	.links a {
		font-size: 0.8rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		text-decoration: none;
		color: #333;
	}

	.links a.active {
		background: #2563eb;
		color: #fff;
		border-color: #2563eb;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	@media (max-width: 900px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}

	h2 {
		font-size: 1rem;
		margin: 0 0 0.5rem;
	}

	pre {
		margin: 0;
		padding: 1rem;
		background: #1e1e1e;
		color: #e0e0e0;
		border-radius: 6px;
		overflow: auto;
		max-height: 80vh;
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
		font-size: 0.8rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-word;
	}

	pre.error {
		background: #3b1212;
		color: #ffb4b4;
	}
</style>
