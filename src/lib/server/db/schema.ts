import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// 文法項目1つ = FSRSカード1枚。ts-fsrs の Card の各フィールドを保持する。
// 日付は epoch ミリ秒(integer)で保存する。
export const cards = sqliteTable('cards', {
	itemId: text('item_id').primaryKey(),
	due: integer('due').notNull(),
	stability: real('stability').notNull(),
	difficulty: real('difficulty').notNull(),
	elapsedDays: real('elapsed_days').notNull(),
	scheduledDays: real('scheduled_days').notNull(),
	learningSteps: integer('learning_steps').notNull().default(0),
	reps: integer('reps').notNull(),
	lapses: integer('lapses').notNull(),
	state: integer('state').notNull(),
	lastReview: integer('last_review')
});

// 復習履歴（1回の学習セッションの結果）
export const reviewLogs = sqliteTable('review_logs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	itemId: text('item_id').notNull(),
	rating: integer('rating').notNull(),
	reviewedAt: integer('reviewed_at').notNull(),
	correctCount: integer('correct_count').notNull(),
	totalCount: integer('total_count').notNull(),
	elapsedMs: integer('elapsed_ms').notNull(),
	scheduledDays: real('scheduled_days').notNull(),
	dueAfter: integer('due_after').notNull()
});

// 単体クイズ(/quiz/[id])終了時の得点履歴。日付ごとに1件残す。
export const quizScores = sqliteTable('quiz_scores', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	itemId: text('item_id').notNull(),
	score: integer('score').notNull(), // 受験時の得点 0-100（減衰前）
	takenAt: integer('taken_at').notNull() // epoch ms
});

export type CardRow = typeof cards.$inferSelect;
export type ReviewLogRow = typeof reviewLogs.$inferSelect;
export type QuizScoreRow = typeof quizScores.$inferSelect;
