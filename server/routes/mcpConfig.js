const express = require('express');
const router = express.Router();
const { MCPConfigService } = require('../database/services/MCPConfigService');
const { ApiResponse } = require('../utils/response');
const path = require('path');
const fs = require('fs');

const CURSOR_CONFIG_PATH = path.join(process.env.HOME || process.env.USERPROFILE || '', '.cursor', 'mcp.json');

function readCursorConfig() {
  try {
    const content = fs.readFileSync(CURSOR_CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return { mcpServers: {} };
  }
}

function writeCursorConfig(config) {
  const dir = path.dirname(CURSOR_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CURSOR_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function validateConfigPayload(payload) {
  const errors = [];

  if (!payload.toolId || typeof payload.toolId !== 'string') {
    errors.push('toolId 必须是字符串');
  }

  if (!payload.command || typeof payload.command !== 'string' || !payload.command.trim()) {
    errors.push('command 不能为空');
  }

  const normalized = {
    toolId: payload.toolId?.trim(),
    command: payload.command?.trim(),
    description: payload.description?.trim() || null,
    workingDirectory: payload.workingDirectory ? payload.workingDirectory.trim() : null,
    args: [],
    env: {}
  };

  if (payload.args !== undefined) {
    if (!Array.isArray(payload.args)) {
      errors.push('args 必须是字符串数组');
    } else {
      normalized.args = payload.args.map((arg, index) => {
        if (typeof arg !== 'string') {
          errors.push(`args 第 ${index + 1} 项不是字符串`);
          return '';
        }
        return arg;
      });
    }
  }

  if (payload.env !== undefined) {
    if (typeof payload.env !== 'object' || Array.isArray(payload.env)) {
      errors.push('env 必须是对象');
    } else {
      normalized.env = {};
      Object.entries(payload.env).forEach(([key, value]) => {
        if (typeof value !== 'string') {
          errors.push(`环境变量 ${key} 的值必须是字符串`);
        } else {
          normalized.env[key] = value;
        }
      });
    }
  }

  if (errors.length > 0) {
    const error = new Error(errors.join('; '));
    error.status = 400;
    throw error;
  }

  return normalized;
}

function pickSafeConfig(config) {
  return {
    command: config.command,
    args: config.args || [],
    env: config.env || {},
    workingDirectory: config.workingDirectory || null
  };
}

router.get('/', (req, res) => {
  try {
    const configs = MCPConfigService.list();
    res.json(ApiResponse.success(configs, '获取配置成功'));
  } catch (error) {
    res.status(500).json(ApiResponse.error(error.message, 500));
  }
});

router.post('/', (req, res) => {
  try {
    const normalized = validateConfigPayload(req.body || {});

    const exists = MCPConfigService.getByToolId(normalized.toolId);
    if (exists) {
      return res.status(400).json(ApiResponse.error('toolId 已存在，请使用PUT更新', 400));
    }

    const config = MCPConfigService.create(normalized);

    res.json(ApiResponse.success(config));
  } catch (error) {
    res.status(error.status || 500).json(ApiResponse.error(error.message, error.status || 500));
  }
});

router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = MCPConfigService.getById(id);
    if (!existing) {
      return res.status(404).json(ApiResponse.error('配置不存在', 404));
    }

    const normalized = validateConfigPayload({ ...existing, ...req.body, toolId: existing.toolId });

    const config = MCPConfigService.update(id, normalized);

    res.json(ApiResponse.success(config));
  } catch (error) {
    res.status(error.status || 500).json(ApiResponse.error(error.message, error.status || 500));
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const success = MCPConfigService.delete(id);
    res.json(ApiResponse.success({ success }, '删除成功'));
  } catch (error) {
    res.status(500).json(ApiResponse.error(error.message, 500));
  }
});

router.post('/apply', (req, res) => {
  try {
    const configs = MCPConfigService.list();
    const cursorConfig = readCursorConfig();

    if (!cursorConfig.mcpServers || typeof cursorConfig.mcpServers !== 'object') {
      cursorConfig.mcpServers = {};
    }

    configs.forEach(cfg => {
      cursorConfig.mcpServers[cfg.toolId] = pickSafeConfig(cfg);
    });

    writeCursorConfig(cursorConfig);

    res.json(ApiResponse.success(cursorConfig));
  } catch (error) {
    res.status(500).json(ApiResponse.error(error.message, 500));
  }
});

module.exports = router;


