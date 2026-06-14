// DJ 业务类型的 canonical 引用点 — 业务代码 (use-cases, prompt builders) 应从这里 import
// 真实 schema 定义在 @deepulse/shared/dj-ws (transport 验证层, 那边能引 zod)
// 这里只 type-only re-export, 不引入 runtime 依赖
//
// 为什么不直接让业务代码引 shared:
//   - shared 是 transport 层 (wire format / zod / logger), 业务概念 (DjContext) 落在它里面
//     是 architect audit 标出来的 "概念循环依赖"
//   - 此 re-export 把 canonical home 拉回 application, shared 留作 schema 定义
//   - 真正的物理移动 (把 schema 也搬过来) 会触发 shared 反向依赖 application, 不通

export type { DjContext } from '@deepulse/shared/dj-ws'
