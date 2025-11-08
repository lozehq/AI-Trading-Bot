const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { validateBody } = require('../validators');
const service = require('../services/promptProfilesService');

// List profiles
router.get('/', (req, res) => {
  const profiles = service.getProfiles().map(p => ({ id: p.id, name: p.name, type: p.type, deletable: !!p.deletable, editable: !!p.editable }));
  res.json({ success: true, data: { profiles, activeId: service.getActiveId() } });
});

// Get active profile (include content when raw)
router.get('/active', (req, res) => {
  const activeId = service.getActiveId();
  const profiles = service.getProfiles();
  const p = profiles.find(x => x.id === activeId) || profiles[0];
  const payload = { id: p.id, name: p.name, type: p.type };
  if (p.type === 'raw') payload.content = p.content || '';
  res.json({ success: true, data: payload });
});

// Import profile
router.post('/import', validateBody(Joi.object({
  name: Joi.string().min(1).max(100).required(),
  content: Joi.string().min(10).max(20000).required()
})), (req, res) => {
  const { name, content } = req.body;
  try {
    const created = service.addProfile({ name, content });
    res.json({ success: true, data: { id: created.id } });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Activate profile
router.post('/activate', validateBody(Joi.object({ id: Joi.string().required() })), (req, res) => {
  try {
    const id = service.setActive(req.body.id);
    res.json({ success: true, data: { id } });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Update profile
router.put('/:id', validateBody(Joi.object({ name: Joi.string().min(1).max(100).optional(), content: Joi.string().min(10).max(20000).optional() })), (req, res) => {
  try {
    const updated = service.updateProfile(req.params.id, req.body);
    res.json({ success: true, data: { id: updated.id } });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Delete profile (not default)
router.delete('/:id', (req, res) => {
  try {
    service.deleteProfile(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

module.exports = router;