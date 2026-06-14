// 跨包 DTO（暴露给 PWA / 后端 / 各 adapter）
// 内部领域模型放 @deepulse/domain，不在这里

// 占位：第一个真实类型会在 M1 时加入
export type Iso8601String = string & { readonly __brand: 'Iso8601String' }
