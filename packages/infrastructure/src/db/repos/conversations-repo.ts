/* eslint-disable @typescript-eslint/require-await -- better-sqlite3 is sync */
// ConversationsRepo · DJ 对话历史
// 接口 + ConversationEntry 在 application/ports/repos.ts

import { desc } from 'drizzle-orm'

import { conversations, type DbConversation } from '../schema.js'

import type { DbClient } from '../client.js'
import type { ConversationEntry, IConversationsRepo } from '@claudio/application'

function dbRowToEntry(row: DbConversation): ConversationEntry {
  const base = { tsMs: row.tsMs, userMsg: row.userMsg, djReply: row.djReply }
  const withLatency =
    row.brainLatencyMs !== null ? { ...base, brainLatencyMs: row.brainLatencyMs } : base
  return row.contextSize !== null ? { ...withLatency, contextSize: row.contextSize } : withLatency
}

export function createConversationsRepo(client: DbClient): IConversationsRepo {
  return {
    async append(entry: ConversationEntry): Promise<void> {
      client.db
        .insert(conversations)
        .values({
          tsMs: entry.tsMs,
          userMsg: entry.userMsg,
          djReply: entry.djReply,
          brainLatencyMs: entry.brainLatencyMs ?? null,
          contextSize: entry.contextSize ?? null,
        })
        .run()
    },

    async recent(limit: number): Promise<readonly ConversationEntry[]> {
      const rows = client.db
        .select()
        .from(conversations)
        .orderBy(desc(conversations.tsMs))
        .limit(limit)
        .all()
      return rows.map(dbRowToEntry)
    },
  }
}
