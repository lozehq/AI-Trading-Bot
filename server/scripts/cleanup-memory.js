#!/usr/bin/env node
/**
 * AI记忆清理脚本
 * 清理历史AI分析记录和向量嵌入数据
 */

const { getDatabase } = require('../database/database');

function cleanupMemory(options = {}) {
  const {
    keepDays = 7,        // 保留最近N天的数据
    vacuum = true,       // 是否执行VACUUM优化
    dryRun = false       // 是否只是预览，不实际删除
  } = options;

  const db = getDatabase();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);
  const cutoffDateStr = cutoffDate.toISOString();

  console.log('\n' + '='.repeat(60));
  console.log('🧹 AI记忆清理工具');
  console.log('='.repeat(60));
  console.log(`保留时间: 最近 ${keepDays} 天`);
  console.log(`截止日期: ${cutoffDate.toLocaleString()}`);
  console.log(`模式: ${dryRun ? '预览模式（不实际删除）' : '执行模式'}`);
  console.log('='.repeat(60) + '\n');

  try {
    // 1. 统计当前数据量
    console.log('📊 当前数据统计:');
    const stats = {
      ai_analyses: db.prepare('SELECT COUNT(*) as count FROM ai_analyses').get().count,
      ai_embeddings: 0,
      ai_embeddings_v2: 0
    };

    try {
      stats.ai_embeddings = db.prepare('SELECT COUNT(*) as count FROM ai_embeddings').get().count;
    } catch (e) {
      console.log('   ℹ️  ai_embeddings表不存在');
    }

    try {
      stats.ai_embeddings_v2 = db.prepare('SELECT COUNT(*) as count FROM ai_embeddings_v2').get().count;
    } catch (e) {
      console.log('   ℹ️  ai_embeddings_v2表不存在');
    }

    console.log(`   - AI分析记录: ${stats.ai_analyses} 条`);
    console.log(`   - 向量嵌入(v1): ${stats.ai_embeddings} 条`);
    console.log(`   - 向量嵌入(v2): ${stats.ai_embeddings_v2} 条`);

    // 2. 预览将要删除的数据
    const toDeleteAnalyses = db.prepare(
      'SELECT COUNT(*) as count FROM ai_analyses WHERE created_at < ?'
    ).get(cutoffDateStr).count;

    let toDeleteEmbeddings = 0;
    try {
      toDeleteEmbeddings = db.prepare(
        'SELECT COUNT(*) as count FROM ai_embeddings WHERE created_at < ?'
      ).get(cutoffDateStr).count;
    } catch (e) {}

    let toDeleteEmbeddingsV2 = 0;
    try {
      toDeleteEmbeddingsV2 = db.prepare(
        'SELECT COUNT(*) as count FROM ai_embeddings_v2 WHERE created_at < ?'
      ).get(cutoffDateStr).count;
    } catch (e) {}

    console.log('\n⚠️  将要删除的数据:');
    console.log(`   - AI分析记录: ${toDeleteAnalyses} 条 (${((toDeleteAnalyses/stats.ai_analyses)*100).toFixed(1)}%)`);
    console.log(`   - 向量嵌入(v1): ${toDeleteEmbeddings} 条`);
    console.log(`   - 向量嵌入(v2): ${toDeleteEmbeddingsV2} 条`);

    if (toDeleteAnalyses === 0) {
      console.log('\n✅ 无需清理，数据都在保留期内');
      return;
    }

    if (dryRun) {
      console.log('\n💡 这是预览模式，不会实际删除数据');
      console.log('   要执行清理，请运行: node cleanup-memory.js --execute');
      return;
    }

    // 3. 执行清理
    console.log('\n🗑️  开始清理...');
    
    db.transaction(() => {
      // 清理AI分析记录
      const analysesResult = db.prepare(
        'DELETE FROM ai_analyses WHERE created_at < ?'
      ).run(cutoffDateStr);
      console.log(`   ✅ 清理AI分析记录: ${analysesResult.changes} 条`);

      // 清理向量嵌入
      try {
        const embeddingsResult = db.prepare(
          'DELETE FROM ai_embeddings WHERE created_at < ?'
        ).run(cutoffDateStr);
        console.log(`   ✅ 清理向量嵌入(v1): ${embeddingsResult.changes} 条`);
      } catch (e) {}

      try {
        const embeddingsV2Result = db.prepare(
          'DELETE FROM ai_embeddings_v2 WHERE created_at < ?'
        ).run(cutoffDateStr);
        console.log(`   ✅ 清理向量嵌入(v2): ${embeddingsV2Result.changes} 条`);
      } catch (e) {}
    })();

    // 4. 清理孤立的嵌入数据（没有对应的分析记录）
    console.log('\n🧹 清理孤立数据...');
    try {
      const orphanEmbeddings = db.prepare(`
        DELETE FROM ai_embeddings 
        WHERE analysis_id NOT IN (SELECT id FROM ai_analyses)
      `).run();
      console.log(`   ✅ 清理孤立嵌入(v1): ${orphanEmbeddings.changes} 条`);
    } catch (e) {}

    try {
      const orphanEmbeddingsV2 = db.prepare(`
        DELETE FROM ai_embeddings_v2 
        WHERE analysis_id NOT IN (SELECT id FROM ai_analyses)
      `).run();
      console.log(`   ✅ 清理孤立嵌入(v2): ${orphanEmbeddingsV2.changes} 条`);
    } catch (e) {}

    // 5. 执行VACUUM优化
    if (vacuum) {
      console.log('\n⚡ 优化数据库空间...');
      const sizeBefore = db.prepare('PRAGMA page_count').get().page_count;
      db.pragma('vacuum');
      const sizeAfter = db.prepare('PRAGMA page_count').get().page_count;
      const saved = sizeBefore - sizeAfter;
      console.log(`   ✅ 释放空间: ${saved} 页 (约 ${(saved * 4096 / 1024 / 1024).toFixed(2)} MB)`);
    }

    // 6. 显示清理后统计
    console.log('\n📊 清理后数据统计:');
    const newStats = {
      ai_analyses: db.prepare('SELECT COUNT(*) as count FROM ai_analyses').get().count,
      ai_embeddings: 0,
      ai_embeddings_v2: 0
    };

    try {
      newStats.ai_embeddings = db.prepare('SELECT COUNT(*) as count FROM ai_embeddings').get().count;
    } catch (e) {}

    try {
      newStats.ai_embeddings_v2 = db.prepare('SELECT COUNT(*) as count FROM ai_embeddings_v2').get().count;
    } catch (e) {}

    console.log(`   - AI分析记录: ${newStats.ai_analyses} 条 (减少 ${stats.ai_analyses - newStats.ai_analyses})`);
    console.log(`   - 向量嵌入(v1): ${newStats.ai_embeddings} 条 (减少 ${stats.ai_embeddings - newStats.ai_embeddings})`);
    console.log(`   - 向量嵌入(v2): ${newStats.ai_embeddings_v2} 条 (减少 ${stats.ai_embeddings_v2 - newStats.ai_embeddings_v2})`);

    console.log('\n✅ 清理完成！');

  } catch (error) {
    console.error('\n❌ 清理失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 命令行参数解析
const args = process.argv.slice(2);
const options = {
  keepDays: 7,
  vacuum: true,
  dryRun: true
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--execute' || arg === '-x') {
    options.dryRun = false;
  } else if (arg === '--keep-days' || arg === '-k') {
    options.keepDays = parseInt(args[++i]) || 7;
  } else if (arg === '--no-vacuum') {
    options.vacuum = false;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
使用方法: node cleanup-memory.js [选项]

选项:
  --execute, -x          实际执行清理（默认只是预览）
  --keep-days <天数>, -k 保留最近N天的数据（默认7天）
  --no-vacuum            跳过VACUUM优化
  --help, -h             显示此帮助信息

示例:
  node cleanup-memory.js                      # 预览清理（保留7天）
  node cleanup-memory.js --execute            # 执行清理（保留7天）
  node cleanup-memory.js -x -k 30            # 执行清理（保留30天）
  node cleanup-memory.js --execute --no-vacuum  # 执行清理但不优化
    `);
    process.exit(0);
  }
}

// 执行清理
cleanupMemory(options);

