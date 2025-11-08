const axios = require('axios');
const { getDatabase } = require('./server/database/database');

async function diagnoseiflow() {
  console.log('\n═══════════════════════════════════════');
  console.log('🔍 iflow.cn API 诊断');
  console.log('═══════════════════════════════════════\n');

  // 从数据库读取配置
  const db = getDatabase();
  const getDBSetting = (key) => {
    try {
      const row = db.prepare('SELECT value FROM api_settings WHERE category = ? AND key = ?').get('ai', key);
      return row?.value || null;
    } catch (_) { return null; }
  };

  const apiKey = process.env.DEEPSEEK_API_KEY || getDBSetting('deepseekApiKey');
  const endpointUrl = process.env.DEEPSEEK_ENDPOINT_URL || getDBSetting('endpointUrl') || '';
  const baseUrl = process.env.DEEPSEEK_BASE_URL || getDBSetting('deepseekBaseUrl') || 'https://api.deepseek.com';
  const endpointPath = process.env.DEEPSEEK_ENDPOINT_PATH || getDBSetting('endpointPath') || '/v1/chat/completions';
  const modelName = process.env.DEEPSEEK_MODEL || getDBSetting('modelName') || 'deepseek-chat';

  const url = endpointUrl && endpointUrl.trim() 
    ? endpointUrl.trim() 
    : `${baseUrl.replace(/\/$/, '')}${endpointPath.startsWith('/') ? endpointPath : ('/' + endpointPath)}`;

  console.log('📋 配置信息:');
  console.log(`   API Key: ${apiKey ? (apiKey.length > 8 ? apiKey.slice(0,4) + '***' + apiKey.slice(-4) : '***') : '未配置'}`);
  console.log(`   URL: ${url}`);
  console.log(`   Model: ${modelName}`);
  console.log('');

  if (!apiKey) {
    console.error('❌ API密钥未配置');
    process.exit(1);
  }

  try {
    console.log('🚀 发送测试请求...\n');
    const response = await axios.post(
      url,
      {
        model: modelName,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 10
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log('✅ HTTP状态:', response.status);
    console.log('');
    console.log('📄 完整响应:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('');

    // 尝试解析
    const data = response.data;
    console.log('🔍 响应结构分析:');
    console.log(`   - 顶层字段: ${Object.keys(data).join(', ')}`);
    console.log(`   - 是否有 body 字段: ${!!data.body}`);
    console.log(`   - 是否有 choices 字段: ${!!data.choices}`);
    console.log(`   - 是否有 status 字段: ${!!data.status}`);
    
    if (data.body) {
      console.log(`   - body 类型: ${typeof data.body}`);
      if (typeof data.body === 'object') {
        console.log(`   - body 字段: ${Object.keys(data.body).join(', ')}`);
      }
    }
    
    if (data.choices) {
      console.log(`   - choices 长度: ${data.choices.length}`);
      if (data.choices[0]) {
        console.log(`   - choices[0] 字段: ${Object.keys(data.choices[0]).join(', ')}`);
      }
    }

    console.log('\n✅ 诊断完成');
  } catch (error) {
    console.error('\n❌ 请求失败:');
    console.error(`   状态码: ${error.response?.status}`);
    console.error(`   错误: ${error.message}`);
    if (error.response?.data) {
      console.error('\n📄 错误响应:');
      console.error(JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

diagnoseiflow().catch(console.error);

