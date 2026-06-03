/**
 * routes/expenses.js
 * Income & Expense tracking per business category
 * Uses Firebase Realtime Database indexing
 * Categories: RENTAL, BUSINESS, AGRI, NON_AGRI
 */
const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { requireEmployee, requireManager, requireViewer } = require('../middleware/auth.middleware');

// GET /api/expenses?biz=RENTAL&entity=ENTITY_ID — list all income/expense entries
router.get('/', requireViewer, async (req, res) => {
  const biz = req.query.biz || 'RENTAL';
  const entityId = req.query.entity || '';
  try {
    if (!db) return res.json({ success: true, data: [] });
    const snap = await db.ref(`expenses/${biz}`).orderByChild('date').once('value');
    const val = snap.val() || {};
    let data = Object.keys(val).map(k => ({ id: k, ...val[k] })).reverse();
    if (entityId) data = data.filter(e => e.entityId === entityId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/expenses — record income or expense
router.post('/', requireEmployee, async (req, res) => {
  const { type, description, amount, date, category, notes, businessCategory, entityId, entityName } = req.body;
  const biz = businessCategory || 'RENTAL';
  if (!description || !amount) {
    return res.status(400).json({ success: false, message: 'Description and amount are required.' });
  }
  const entry = {
    type: type || 'expense',
    description,
    amount: parseFloat(amount),
    date: date || new Date().toISOString().split('T')[0],
    category: category || 'other',
    notes: notes || '',
    businessCategory: biz,
    entityId: entityId || '',
    entityName: entityName || '',
    recordedBy: req.session.user.name,
    createdAt: new Date().toISOString(),
  };
  try {
    if (!db) return res.json({ success: true, data: entry });
    const ref = db.ref(`expenses/${biz}`).push();
    entry.id = ref.key;
    await ref.set(entry);
    res.json({ success: true, data: entry });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/expenses/:id — update entry
router.put('/:id', requireEmployee, async (req, res) => {
  const { id } = req.params;
  const { businessCategory } = req.body;
  const biz = businessCategory || req.query.biz || 'RENTAL';
  const updates = { ...req.body, updatedAt: new Date().toISOString() };
  try {
    if (!db) return res.json({ success: true });
    await db.ref(`expenses/${biz}/${id}`).update(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', requireManager, async (req, res) => {
  const { id } = req.params;
  try {
    if (!db) return res.json({ success: true });
    const categories = ['RENTAL', 'BUSINESS', 'AGRI', 'NON_AGRI'];
    for (const cat of categories) {
      const snap = await db.ref(`expenses/${cat}/${id}`).once('value');
      if (snap.exists()) {
        await db.ref(`expenses/${cat}/${id}`).remove();
        return res.json({ success: true });
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
