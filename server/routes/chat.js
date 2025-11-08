const express = require('express');
const router = express.Router();
const { validateBody, validateQuery, schemas } = require('../validators');
const ChatService = require('../database/services/ChatService');

// 列出会话
router.get('/conversations', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50'), 500);
    const offset = Math.max(parseInt(req.query.offset || '0'), 0);
    const list = ChatService.listConversations({ limit, offset });
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 新建会话
router.post('/conversations', (req, res) => {
  try {
    const id = ChatService.createConversation(req.body?.name);
    res.json({ success: true, data: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 重命名会话
router.patch('/conversations/:id', (req, res) => {
  try {
    const ok = ChatService.renameConversation(parseInt(req.params.id), req.body?.name || '未命名会话');
    res.json({ success: ok });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 删除会话
router.delete('/conversations/:id', (req, res) => {
  try {
    const ok = ChatService.deleteConversation(parseInt(req.params.id));
    res.json({ success: ok });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 清空全部会话
router.delete('/conversations', (req, res) => {
  try {
    ChatService.clearAll();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 获取某会话消息
router.get('/messages', (req, res) => {
  try {
    const conversationId = parseInt(req.query.conversationId);
    if (!conversationId) return res.status(400).json({ success: false, error: 'conversationId 必填' });
    const limit = Math.min(parseInt(req.query.limit || '200'), 1000);
    const offset = Math.max(parseInt(req.query.offset || '0'), 0);
    const list = ChatService.getMessages({ conversationId, limit, offset });
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 追加消息
router.post('/messages', (req, res) => {
  try {
    const { conversationId, role, content, metadata } = req.body || {};
    if (!conversationId || !role || !content) return res.status(400).json({ success: false, error: '缺少必要参数' });
    const id = ChatService.appendMessage({ conversationId: parseInt(conversationId), role, content, metadata });
    res.json({ success: true, data: { id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 清空会话消息
router.delete('/messages', (req, res) => {
  try {
    const conversationId = parseInt(req.query.conversationId);
    if (!conversationId) return res.status(400).json({ success: false, error: 'conversationId 必填' });
    const count = ChatService.clearConversation(conversationId);
    res.json({ success: true, data: { deleted: count } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;


