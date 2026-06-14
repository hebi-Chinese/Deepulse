/* eslint-disable @typescript-eslint/require-await -- better-sqlite3 is sync */
// ConversationsRepo · DJ 对话历史 (append-only 归档)
// 接口 + ConversationEntry 在 application/ports/repos.ts.
// prompt context 现在走 shortTerm (Redis 热缓存), 这里只剩持久审计/分析用途.

import { conversations } from '../schema.js'

import type { DbClient } from '../client.js'
import type { ConversationEntry, IConversationsRepo } from '@deepulse/application'

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
          contextSize: null,
        })
        .run()
    },
  }
}
