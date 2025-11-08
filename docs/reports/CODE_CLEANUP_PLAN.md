# 代码屎山整治方案（清理计划）

> **目标**：在不影响现有业务功能的前提下，逐步拆除当前项目中的屎山代码、冗余功能和危险实现，建立可维护、可扩展且安全的代码基础。

---

## 🔺 P0（立即执行，1 周内完成）

- **AI 增强主流程拆分**  
  - 将 `server/routes/aiEnhanced.js` 中的 `gatherAllMCPData`/`analyzeWithMCPData` 拆分为：
    - `services/dataCollectors/coreCollector.js`（CCXT/MCP 核心行情）
    - `services/dataCollectors/derivativesCollector.js`（资金费率/持仓/清算）
    - `services/dataCollectors/emotionCollector.js`（官方 FGI/CoinGecko 情绪）
    - `services/dataCollectors/newsCollector.js`（AkTools & Binance AI 文本→结构化）
    - 路由层只负责 orchestration + response 包装。

- **风险路由加固**  
  - `app.use('/api', apiKeyAuth)`；关键路由额外校验 IP/角色。  
  - 统一 `validators/index.js` 输入校验，补齐 `trading.js`、`priceAlert.js`、`marketData.js` 未验证点。

- **淘汰遗留服务**  
  - 完成 `mcpService` → `mcpIntegration` 迁移，确保 `dataSourceManager` 仅依赖新接口。  
  - 删除未接入文件（已移除 `server/services/dataGatherer.js`）；同步更新文档与引用。

- **文档整理**  
  - 建立 `docs/archive/`；搬迁或合并雷同报告（`CODE_FIXES_*`、`*_完成.md`）。  
  - 恢复误删的 `DATA_INDICATORS_COVERAGE_REPORT.md` 并放回 `docs/reports/`。

---

## 🟡 P1（本月完成，2-4 周）

- **React 组件瘦身**  
  - `client/src/components/AutoAIPanel.jsx` 拆为 Hook + 子组件（状态机、步骤面板、指标面板、执行结果）。  
  - 图标按需导入；硬编码文案迁至 `i18n/translations.js`。

- **指标与数据对齐**  
  - 根据 `DATA_INDICATORS_COVERAGE_REPORT.md` checklist，实现 KDJ/Ichimoku/Aroon 注入；衍生品 API 封装；AkTools 文本解析。

- **日志与配置统一**  
  - 统一 `logger`；移除 `console.log`；将超时/重试/TTL 类魔法数字集中至 `config/constants.js`。

- **Backtest 模块重构起步**  
  - 策略注册改为 `strategies/` 目录 + 白名单；结果落地数据库；接口增加认证/校验。

---

## 🟢 P2（下月计划，4-8 周）

- **测试与质量保障**  
  - 引入 Jest + Supertest；覆盖核心服务（AI、数据源、指标、Backtest）。  
  - CI 集成 ESLint + Prettier；建立 commit lint。

- **Type Safety 与文档**  
  - 渐进式引入 TS 或 JSDoc；优先服务层与复杂 DTO。  
  - 更新开发文档（项目结构、MCP 配置、API 使用）。

- **性能与稳定性**  
  - 数据收集层加缓存/降级策略表；AkTools/外部 API 添加熔断；前端引入懒加载与代码分割。

---

## 🧹 已执行的快速清理

- 移除未接入的 `server/services/dataGatherer.js`（避免误导与重复逻辑）。
- 整体屎山扫描完成，风险点（路由输入校验缺失、MCP/CCXT 双轨等）已标记。

---

## ✅ 下一步推荐动作

1. 恢复 `DATA_INDICATORS_COVERAGE_REPORT.md` → `docs/reports/`，供指标对齐任务引用。
2. 开始拆分 `aiEnhanced` 数据收集逻辑（建议先落地 `coreCollector` + `derivativesCollector`）。
3. 准备 API Key 方案与路由接入计划。

如需我主导其中某条任务，请直接指定优先级。  
（最后更新：2025-10-25）


