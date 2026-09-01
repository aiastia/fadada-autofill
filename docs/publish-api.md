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

```bash
gh secret set EDGE_API_KEY        # 和宏助手同一个 key（账号级）
gh secret set EDGE_CLIENT_ID      # ✅ 已代填
gh secret set EDGE_PRODUCT_ID     # 本扩展自己的！合作伙伴中心 → 打开本扩展 → 概览页 Extension identity → 产品 ID
```

⚠️ `EDGE_PRODUCT_ID` 千万别填成宏助手的，API 靠它定位要更新哪个扩展。

如果当初的 API Key 没存下来：合作伙伴中心 Publish API 页重新生成一个 → **两个仓库都要更新**（重新生成会让旧 key 失效）。

### Chrome（4 个）

```bash
cd ~/Desktop/fadada-autofill
node tools/cws-auth.mjs           # 浏览器点一次授权，自动写入本仓库的 CWS_CLIENT_ID/SECRET/REFRESH_TOKEN
gh secret set CWS_ITEM_ID         # 本扩展自己的！Chrome 商店开发者后台 → 本条目页面的 Item ID
```

注意：本扩展 1.2.0 的 Chrome 版 08-31 提交的审核期间 API 传不了包，等审核结束后再跑。

## 日常发版

```
git tag v1.2.1 && git push origin v1.2.1     # 两商店自动更新
```
