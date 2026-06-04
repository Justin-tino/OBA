/**
 * routes/sales.js
 * Sales transaction CRUD per business category
 * Uses Firebase Realtime Database indexing
 * Categories: RENTAL, BUSINESS, AGRI, NON_AGRI, MAIN
 */
const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { requireEmployee, requireManager, requireViewer } = require('../middleware/auth.middleware');

// GET /api/sales?biz=RENTAL&entity=ENTITY_ID — list all sales for a category
router.get('/', requireViewer, async (req, res) => {
  const biz = req.query.biz || 'RENTAL';
  const entityId = req.query.entity || '';
  try {
    if (!db) return res.json({ success: true, data: [] });
    const snap = await db.ref(`sales/${biz}`).orderByChild('date').once('value');
    const val = snap.val() || {};
    let sales = Object.keys(val).map(k => ({ id: k, ...val[k] })).reverse();
    // Filter by entity if specified
    if (entityId) sales = sales.filter(s => s.entityId === entityId);
    res.json({ success: true, data: sales });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/sales — record a new sale
router.post('/', requireEmployee, async (req, res) => {
  const { items, total, paymentMethod, notes, businessCategory, entityId, entityName, subtotal, taxRate, taxAmount } = req.body;
  const biz = businessCategory || 'RENTAL';

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'No items in transaction.' });
  }

  const transaction = {
    date: new Date().toISOString(),
    items,
    subtotal: parseFloat(subtotal || 0),
    taxRate: parseFloat(taxRate || 0),
    taxAmount: parseFloat(taxAmount || 0),
    total: parseFloat(total || 0),
    paymentMethod: paymentMethod || 'cash',
    notes: notes || '',
    businessCategory: biz,
    recordedBy: req.session.user.uid,
    recordedByName: req.session.user.name,
    entityId: entityId || '',
    entityName: entityName || '',
    createdAt: new Date().toISOString(),
  };

  try {
    if (!db) return res.json({ success: true, data: transaction });
    const ref = db.ref(`sales/${biz}`).push();
    transaction.id = ref.key;
    transaction.transactionId = 'TXN-' + ref.key.substring(1, 8).toUpperCase();

    // Recalculate total if not passed or zero
    if (!transaction.total && transaction.items.length > 0) {
      transaction.subtotal = transaction.items.reduce((sum, item) => sum + ((parseFloat(item.unitPrice) || 0) * (parseInt(item.quantity || item.qty) || 1)), 0);
      transaction.taxRate = transaction.taxRate || 0;
      transaction.taxAmount = transaction.subtotal * (transaction.taxRate / 100);
      transaction.total = transaction.subtotal + transaction.taxAmount;
    }

    await ref.set(transaction);

    // Deduct inventory quantities
    for (const item of items) {
      if (item.id) {
        const itemRef = db.ref(`inventory/${biz}/${item.id}`);
        const snap = await itemRef.once('value');
        if (snap.exists()) {
          const invData = snap.val();
          const deductQty = parseInt(item.quantity || item.qty || 1);
          const newQty = Math.max(0, parseInt(invData.quantity || 0) - deductQty);
          const reorder = parseInt(invData.reorderLevel || 10);

          let status = 'in-stock';
          if (newQty <= 0) status = 'out-of-stock';
          else if (newQty <= reorder) status = 'low-stock';

          await itemRef.update({ quantity: newQty, status });

          // Generate notification if low stock
          if (status !== 'in-stock') {
            await db.ref('notifications').push({
              type: 'low_stock',
              title: 'Low Stock Alert',
              message: `${invData.name} has dropped to ${newQty} items.`,
              businessId: biz,
              priority: status === 'out-of-stock' ? 'critical' : 'warning',
              isRead: false,
              createdAt: new Date().toISOString()
            });
          }
        }
      }
    }

    // Auto-generate receipt response
    res.json({ success: true, data: transaction });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/sales/:id
router.delete('/:id', requireManager, async (req, res) => {
  const { id } = req.params;
  try {
    if (!db) return res.json({ success: true });
    const categories = ['RENTAL', 'BUSINESS', 'AGRI', 'NON_AGRI', 'MAIN'];
    for (const cat of categories) {
      const snap = await db.ref(`sales/${cat}/${id}`).once('value');
      if (snap.exists()) {
        await db.ref(`sales/${cat}/${id}`).remove();
        return res.json({ success: true });
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
