# 项目清理计划

> **执行时间**: 2025-11-06  
> **目标**: 删除不需要的文件，减少项目体积，提高可维护性

---

## 📋 待清理文件清单

### 1. 临时日志文件 ❌
```
logs/error-2025-11-05.log
logs/error-2025-11-06.log
```
**原因**: 临时日志文件，应该被 .gitignore 忽略

### 2. 开发聊天记录 ❌
```
项目聊天记录/cursor_.md
项目聊天记录/cursor_okx_api.md
```
**原因**: 开发过程记录，不应该在生产代码中

### 3. 提示词分析文件 ❌
```
prompt-analysis/optimized-full-prompt.txt
prompt-analysis/optimized-simple-prompt.txt
```
**原因**: 临时分析文件，不是核心功能

### 4. 重复的报告文档 ❌
```
docs/reports/COMPREHENSIVE_BUG_CHECK.md
docs/reports/TESTING_COMPLETE.md
docs/reports/CLEANUP-SUMMARY.md
docs/reports/FINAL_SUMMARY.md
docs/reports/FIXES_APPLIED.md
docs/reports/CODE_REVIEW_REPORT.md
```
**原因**: 开发过程中的临时报告，已完成的任务记录

### 5. 重复的路由文件 ❌
```
server/router/mcpControl.js
```
**原因**: 已有 server/routes/mcpControl.js，这是重复文件

### 6. 数据库迁移文件 ⚠️
```
server/resources/migrations/010_add_mcp_configs_table.js
```
**原因**: 迁移已应用到 schema.sql，不再需要单独的迁移文件

### 7. 图片文件 ⚠️
```
AI头像.png
logo.png
```
**原因**: 应该放在 public/ 或 client/public/ 目录

### 8. 开源检查清单 ⚠️
```
OPENSOURCE_CHECKLIST.md
```
**原因**: 如果不打算开源，可以删除

---

## ✅ 保留的文件

### 核心文档
- ✅ README.md - 项目说明
- ✅ SETUP.md - 安装指南
- ✅ docs/API.md - API 文档
- ✅ docs/DEPLOYMENT_GUIDE.md - 部署指南
- ✅ docs/REFACTORING_SUMMARY.md - 重构总结
- ✅ docs/MIGRATION_GUIDE.md - 迁移指南

### 核心报告
- ✅ docs/reports/CODE_CLEANUP_PLAN.md - 清理计划
- ✅ docs/reports/DATA_INDICATORS_COVERAGE_REPORT.md - 指标覆盖报告

### 脚本文件
- ✅ scripts/test-refactoring.js - 测试脚本
- ✅ scripts/monitor-trading.sh - 监控脚本
- ✅ scripts/oneclick-deploy.sh - 部署脚本
- ✅ scripts/trading-report.sh - 报告脚本

---

## 🗑️ 清理操作

### 阶段 1: 删除临时文件
- 删除日志文件
- 删除聊天记录
- 删除提示词分析

### 阶段 2: 删除重复报告
- 保留最重要的文档
- 删除临时开发报告

### 阶段 3: 整理目录结构
- 移动图片到正确位置
- 删除重复路由文件
- 清理迁移文件

---

## 📊 预期效果

- **减少文件数量**: ~15 个文件
- **减少代码行数**: ~5000+ 行
- **提高可维护性**: 移除混乱的临时文件
- **清晰的文档结构**: 只保留必要文档

---

## ⚠️ 注意事项

1. **备份**: 删除前确保有 Git 备份
2. **确认**: 确认文件确实不需要
3. **测试**: 删除后运行测试确保功能正常

