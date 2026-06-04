// IClock · 注入式时间源
// 任何 use-case / repo 实现里要拿 "现在" 都走这个接口, 不直接调 Date.now()
// 让单元测试能模拟时间分支 (TTL 过滤 / 延迟统计 / 时间戳生成)
// 副作用集中到边界 (composition root 绑 SystemClock, 测试里绑 FakeClock)

export type IClock = {
  /** 当前 epoch 毫秒 (= Date.now()) */
  nowMs(): number
}
