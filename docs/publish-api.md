# 自动发版指南（GitHub Actions → Edge / Chrome 商店）

与「宏助手」用的是**同一套账号级凭据**（Edge 发布者账号的 Publish API 凭据、Google 账号的 OAuth 凭据都不变），只是 GitHub Secrets 按仓库隔离，本仓库要重新填一遍。

| 工作流 | 触发方式 | 做的事 |
|---|---|---|
| 发布到 Edge 商店 | Actions 页手动跑 / 推 `v*` tag | 打包 → 传新包 → 提交发布 → 轮询结果 |
| 发布到 Chrome 商店 | 同上 | 打包 → 上传 → 提交审核 |

- 版本号：手动跑可填 / tag 自动取 / 否则用 `manifest.json`；**不能和线上版本重复**。
- 审核期间两商店都拒收新包，等审核完再跑。
- 打包 = 仓库根目录全部文件（已排除 README/.git/.github/tools/docs），与手动上传的 zip 内容一致。

## Secrets 清单

### Edge（3 个）

| Secret | 状态 |
|---|---|
| EDGE_CLIENT_ID | ✅ 已代填 |
| EDGE_PRODUCT_ID | ✅ 已代填（本扩展自己的 d45c0b68-…，来自合作伙伴中心概览页） |
| EDGE_API_KEY | ❌ 待填：和宏助手同一个 key（账号级），`gh secret set EDGE_API_KEY` |

如果当初的 API Key 没存下来：合作伙伴中心 Publish API 页重新生成一个 → **两个仓库都要更新**（重新生成会让旧 key 失效）。

### Chrome（4 个）

| Secret | 状态 |
|---|---|
| CWS_ITEM_ID | ✅ 已代填（本扩展的商品 ID defkcgdm…） |
| CWS_CLIENT_ID / SECRET / REFRESH_TOKEN | ❌ 待填：`cd ~/Desktop/fadada-autofill && node tools/cws-auth.mjs`，浏览器点一次授权即自动写入 |

注意：1.2.0 的 Chrome 版（08-31 提交）审核期间 API 传不了包，等审核结束后再跑。

### ⚠️ 首次运行时机

本扩展两商店线上都已是 **1.2.0**，secrets 配齐后直接跑 CI 会撞版本号被拒。等下次改完代码把 `manifest.json` 升到 1.2.1+ 再跑（或手动跑时在「版本号」里填新版本）。

## 日常发版

```
git tag v1.2.1 && git push origin v1.2.1     # 两商店自动更新
```
