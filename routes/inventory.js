/**
 * routes/inventory.js
 * Inventory management CRUD per business category
 * Uses Firebase Realtime Database with indexing (not collections)
 * Categories: RENTAL, BUSINESS, AGRI, NON_AGRI, MAIN
 */
const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { requireEmployee, requireManager, requireViewer } = require('../middleware/auth.middleware');

function computeStatus(stock, reorderLevel) {
  if (stock <= 0) return 'out-of-stock';
  if (stock <= reorderLevel) return 'low-stock';
  return 'in-stock';
}

// GET /api/inventory?biz=RENTAL&entity=ENTITY_ID
router.get('/', requireViewer, async (req, res) => {
  const biz = req.query.biz || 'RENTAL';
  const entityId = req.query.entity || '';
  try {
    if (!db) return res.json({ success: true, data: [] });
    const snap = await db.ref(`inventory/${biz}`).orderByChild('name').once('value');
    const val = snap.val() || {};
    let products = Object.keys(val).map(k => ({ id: k, ...val[k] }));
    if (entityId) products = products.filter(p => p.entityId === entityId);
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/inventory — add product
router.post('/', requireEmployee, async (req, res) => {
  const { name, category, unit, unitCost, quantity, sellingPrice, reorderLevel, supplier, description, businessCategory, entityId, entityName } = req.body;
  if (!name || !category || quantity === undefined || isNaN(quantity) || sellingPrice === undefined || isNaN(sellingPrice)) {
    return res.status(400).json({ success: false, message: 'Product Name, Category, Quantity, and Selling Price are mandatory fields.' });
  }
  const biz = businessCategory || 'RENTAL';
  const stock = parseInt(quantity || 0);
  const reorder = parseInt(reorderLevel || 10);

  const product = {
    name, category: category || '', unit: unit || 'pcs',
    unitCost: parseFloat(unitCost || 0),
    sellingPrice: parseFloat(sellingPrice || 0),
    quantity: stock,
    reorderLevel: reorder,
    supplier: supplier || '',
    description: description || '',
    businessCategory: biz,
    entityId: entityId || '',
    entityName: entityName || '',
    status: computeStatus(stock, reorder),
    createdAt: new Date().toISOString(),
    createdBy: req.session.user.name,
  };

  try {
    if (!db) {
      product.id = 'prod-' + Date.now();
      product.qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${product.id}`;
      return res.json({ success: true, data: product });
    }
    const ref = db.ref(`inventory/${biz}`).push();
    product.id = ref.key;
    product.qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${ref.key}`;
    await ref.set(product);

    // Notify admins about new product
    const notif = {
      id: `n-${Date.now()}`,
      type: 'inventory',
      title: 'New Product Added',
      message: `${req.session.user.name} added "${name}" to ${biz} inventory (Qty: ${stock})`,
      businessCategory: biz,
      entityId: entityId || '',
      entityName: entityName || '',
      priority: 'info',
      isRead: false,
      createdAt: new Date().toISOString(),
      createdBy: req.session.user.uid,
      createdByName: req.session.user.name,
    };
    await db.ref(`notifications/${notif.id}`).set(notif).catch(() => {});

    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/inventory/:id — update product
router.put('/:id', requireEmployee, async (req, res) => {
  const { id } = req.params;
  const { businessCategory } = req.body;
  const biz = businessCategory || req.query.biz || 'RENTAL';
  const updates = { ...req.body, updatedAt: new Date().toISOString() };
  if (updates.quantity !== undefined && updates.reorderLevel !== undefined) {
    updates.status = computeStatus(parseInt(updates.quantity), parseInt(updates.reorderLevel));
  }

  try {
    if (!db) return res.json({ success: true });

    // Check stock change for notification
    const oldSnap = await db.ref(`inventory/${biz}/${id}`).once('value');
    const oldData = oldSnap.val() || {};
    const oldQty = parseInt(oldData.quantity || 0);
    const newQty = parseInt(updates.quantity !== undefined ? updates.quantity : oldQty);

    await db.ref(`inventory/${biz}/${id}`).update(updates);

    if (newQty !== oldQty) {
      const notif = {
        id: `n-${Date.now()}`,
        type: 'inventory',
        title: 'Stock Updated',
        message: `${req.session.user.name} updated stock of "${oldData.name || updates.name || id}": ${oldQty} → ${newQty} (${biz})`,
        businessCategory: biz,
        entityId: updates.entityId || oldData.entityId || '',
        entityName: updates.entityName || oldData.entityName || '',
        priority: 'info',
        isRead: false,
        createdAt: new Date().toISOString(),
        createdBy: req.session.user.uid,
        createdByName: req.session.user.name,
      };
      await db.ref(`notifications/${notif.id}`).set(notif).catch(() => {});
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/inventory/:id
router.delete('/:id', requireEmployee, async (req, res) => {
  const { id } = req.params;
  try {
    if (!db) return res.json({ success: true });
    const categories = ['RENTAL', 'BUSINESS', 'AGRI', 'NON_AGRI', 'MAIN'];
    for (const cat of categories) {
      const snap = await db.ref(`inventory/${cat}/${id}`).once('value');
      if (snap.exists()) {
        await db.ref(`inventory/${cat}/${id}`).remove();
        return res.json({ success: true });
      }
    }
    res.json({ success: false, message: 'Product not found' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/inventory/:id/delete — same as DELETE but uses POST for reliability
router.post('/:id/delete', requireEmployee, async (req, res) => {
  const { id } = req.params;
  try {
    if (!db) return res.json({ success: true });
    const categories = ['RENTAL', 'BUSINESS', 'AGRI', 'NON_AGRI', 'MAIN'];
    for (const cat of categories) {
      const snap = await db.ref(`inventory/${cat}/${id}`).once('value');
      if (snap.exists()) {
        await db.ref(`inventory/${cat}/${id}`).remove();
        return res.json({ success: true });
      }
    }
    res.json({ success: false, message: 'Product not found' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
