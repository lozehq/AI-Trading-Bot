// Prompt Profiles Service - manage active system prompt for AI analysis
const { getConfig, setConfig } = require('../database/database');
const { buildSmartPrompt } = require('../prompts/tradingSystemPrompt');
const { buildOptimizedSmartPrompt } = require('../prompts/optimizedTradingSystemPrompt');

const KEY_PROFILES = 'ai_prompt_profiles';
const KEY_ACTIVE = 'ai_prompt_active';

// Built-in default profile (non-deletable)
const DEFAULT_PROFILE = {
  id: 'default',
  name: '系统默认提示词',
  type: 'system', // uses tradingSystemPrompt.buildSmartPrompt
  deletable: false,
  editable: false
};

// Optional built-in optimized profile
const OPTIMIZED_PROFILE = {
  id: 'optimized',
  name: '优化版提示词',
  type: 'optimized', // uses optimizedTradingSystemPrompt
  deletable: false,
  editable: false
};

function loadProfiles() {
  const saved = getConfig(KEY_PROFILES);
  const list = Array.isArray(saved) ? saved : [];
  // Prepend built-ins once
  const builtins = [DEFAULT_PROFILE, OPTIMIZED_PROFILE];
  const dedup = new Map();
  for (const p of builtins.concat(list)) {
    if (!p || !p.id) continue;
    // normalize flags
    if (p.id === 'default' || p.id === 'optimized') {
      p.deletable = false; p.editable = false;
    } else {
      if (typeof p.deletable !== 'boolean') p.deletable = true;
      if (typeof p.editable !== 'boolean') p.editable = true;
      if (!p.type) p.type = 'raw';
    }
    dedup.set(p.id, p);
  }
  return Array.from(dedup.values());
}

function saveProfiles(list) {
  const customs = (Array.isArray(list) ? list : []).filter(p => p && p.id && !['default','optimized'].includes(p.id));
  setConfig(KEY_PROFILES, customs);
}

function getProfiles() { return loadProfiles(); }

function getActiveId() {
  const id = getConfig(KEY_ACTIVE);
  return id || 'default';
}

function setActive(id) {
  const profiles = loadProfiles();
  const ok = profiles.some(p => p.id === id);
  if (!ok) throw new Error('提示词不存在');
  setConfig(KEY_ACTIVE, id);
  return id;
}

function addProfile({ name, content }) {
  if (!name || !content) throw new Error('名称与内容必填');
  const id = 'cst_' + Date.now().toString(36);
  const p = { id, name, type: 'raw', content, deletable: true, editable: true };
  const profiles = loadProfiles();
  profiles.push(p);
  saveProfiles(profiles);
  setActive(id);
  return p;
}

function updateProfile(id, { name, content }) {
  if (!id || ['default','optimized'].includes(id)) throw new Error('该提示词不可编辑');
  const profiles = loadProfiles();
  const idx = profiles.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('提示词不存在');
  profiles[idx] = { ...profiles[idx], ...(name ? { name } : {}), ...(content ? { content } : {}) };
  saveProfiles(profiles);
  return profiles[idx];
}

function deleteProfile(id) {
  if (!id || ['default','optimized'].includes(id)) throw new Error('默认提示词不可删除');
  const profiles = loadProfiles();
  const next = profiles.filter(p => p.id !== id);
  saveProfiles(next);
  if (getActiveId() === id) setActive('default');
  return true;
}

// Resolve system prompt builder based on active profile
function resolveSystemPrompt(dataAvailability) {
  const activeId = getActiveId();
  const profiles = loadProfiles();
  const active = profiles.find(p => p.id === activeId);
  if (active && active.type === 'raw' && active.content) return active.content;
  if (active && active.type === 'optimized') return buildOptimizedSmartPrompt(dataAvailability || {});
  // default
  return buildSmartPrompt(dataAvailability || {});
}

module.exports = {
  getProfiles,
  getActiveId,
  setActive,
  addProfile,
  updateProfile,
  deleteProfile,
  resolveSystemPrompt
};