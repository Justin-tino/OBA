/**
 * routes/reports.js
 * Financial report generation routes per business
 * Income Statements, Balance Summary, Cash Flow, Cross-Business Comparison
 */
const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { requireViewer } = require('../middleware/auth.middleware');

const BIZ_CATEGORIES = ['RENTAL', 'BUSINESS', 'AGRI', 'NON_AGRI', 'MAIN'];
const DEFAULT_TAX_RATES = { RENTAL: 12, BUSINESS: 12, AGRI: 0, NON_AGRI: 12, MAIN: 12 };

async function getBizTaxRate(bizId) {
  if (!db) return DEFAULT_TAX_RATES[bizId] || 0;
  try {
    const snap = await db.ref('settings/taxes').once('value');
    const rates = snap.val() || DEFAULT_TAX_RATES;
    return rates[bizId] || DEFAULT_TAX_RATES[bizId] || 0;
  } catch (e) {
    return DEFAULT_TAX_RATES[bizId] || 0;
  }
}

function calcTaxes(sales, gross, taxRate) {
  const stored = sales.reduce((a, s) => a + (parseFloat(s.taxAmount) || 0), 0);
  if (stored > 0) return stored;
  if (gross === 0 || taxRate === 0) return 0;
  return gross * (taxRate / (100 + taxRate));
}

function computeCOGS(sales, inventory) {
  const invMap = {};
  inventory.forEach(item => { invMap[item.id] = item; });
  return sales.reduce((total, sale) => {
    const items = sale.items || [];
    return total + items.reduce((sum, item) => {
      const inv = invMap[item.id];
      if (!inv) return sum;
      const qty = parseInt(item.quantity || item.qty || 1);
      return sum + (parseFloat(inv.unitCost || 0) * qty);
    }, 0);
  }, 0);
}

function filterByPeriod(list, periodStr, dateField = 'date') {
  const now = new Date();
  let start = new Date(0);
  if (periodStr === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (periodStr === 'week') {
    start = new Date(now);
    start.setDate(now.getDate() - 7);
  } else if (periodStr === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  }
  const startMs = start.getTime();
  return list.filter(item => {
    const dStr = item[dateField] || item.createdAt;
    if (!dStr) return true;
    const d = new Date(dStr);
    if (isNaN(d)) return true;
    return d.getTime() >= startMs;
  });
}

async function getBizData(bizId, period) {
  if (!db) return { sales: [], expenses: [], inventory: [] };
  
  // Real business IDs might be RENTAL-1 etc. 
  // Wait, if we use RENTAL-1, we need to pass it as bizId.
  // We can fetch data based on bizId directly.
  
  const sSnap = await db.ref(`sales/${bizId}`).once('value');
  const eSnap = await db.ref(`expenses/${bizId}`).once('value');
  const iSnap = await db.ref(`inventory/${bizId}`).once('value');
  
  const allSales = Object.values(sSnap.val() || {});
  const allExp = Object.values(eSnap.val() || {});
  const invVal = iSnap.val() || {};
  const inventory = Object.keys(invVal).map(k => ({ id: k, ...invVal[k] }));
  
  const sales = period ? filterByPeriod(allSales, period, 'date') : allSales;
  const expenses = period ? filterByPeriod(allExp, period, 'createdAt') : allExp;
  
  return { sales, expenses, inventory };
}

// GET /api/reports/:bizId/summary
router.get('/:bizId/summary', requireViewer, async (req, res) => {
  const { bizId } = req.params;
  const { period = 'month' } = req.query;
  try {
    const { sales, expenses, inventory } = await getBizData(bizId, period);
    
    const grossSales = sales.reduce((a,s) => a + (parseFloat(s.total)||0), 0);
    const taxRate = await getBizTaxRate(bizId);
    const taxes = calcTaxes(sales, grossSales, taxRate);
    const netSales = grossSales - taxes;
    const otherIncome = expenses.filter(e => e.type === 'income').reduce((a,e) => a + (parseFloat(e.amount)||0), 0);
    
    const cogs = computeCOGS(sales, inventory);
    const otherExpenses = expenses.filter(e => e.type === 'expense').reduce((a,e) => a + (parseFloat(e.amount)||0), 0);
    
    // For summary, total revenue = net revenue from the business' perspective
    const revenue = netSales + otherIncome;
    const totalExpenses = cogs + otherExpenses;
    const profit = revenue - totalExpenses;
    
    // Breakdown logic
    const eb = { cogs, utilities: 0, suppliers: 0, salary: 0, other: 0 };
    expenses.filter(e => e.type === 'expense').forEach(e => {
      const c = (e.category || '').toLowerCase();
      if (c.includes('util')) eb.utilities += parseFloat(e.amount)||0;
      else if (c.includes('suppl') || c.includes('inventory')) eb.suppliers += parseFloat(e.amount)||0;
      else if (c.includes('salar') || c.includes('payroll')) eb.salary += parseFloat(e.amount)||0;
      else eb.other += parseFloat(e.amount)||0;
    });

    res.json({ success: true, data: {
      revenue,
      expenses: totalExpenses,
      cogs,
      profit,
      taxes,
      grossSales,
      roi: totalExpenses > 0 ? ((profit / totalExpenses) * 100) : 0,
      salesCount: sales.length,
      period,
      expenseBreakdown: eb
    }});
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/:bizId/income-statement
router.get('/:bizId/income-statement', requireViewer, async (req, res) => {
  const { bizId } = req.params;
  const { period = 'month' } = req.query;
  try {
    const { sales, expenses, inventory } = await getBizData(bizId, period);
    const grossSales = sales.reduce((a,s) => a + (parseFloat(s.total)||0), 0);
    const taxRate = await getBizTaxRate(bizId);
    const taxes = calcTaxes(sales, grossSales, taxRate);
    const salesRevenue = grossSales - taxes;
    const otherIncome = expenses.filter(e => e.type === 'income').reduce((a,e) => a + (parseFloat(e.amount)||0), 0);
    const totalRevenue = salesRevenue + taxes + otherIncome;
    
    // COGS from actual inventory cost of sold items, not from expense records
    const cogs = computeCOGS(sales, inventory);
    const operatingExpenses = expenses.filter(e => e.type === 'expense').reduce((a,e) => a + (parseFloat(e.amount)||0), 0);
    const totalExpenses = cogs + operatingExpenses;
    const netIncome = salesRevenue + otherIncome - totalExpenses;
    
    res.json({ success: true, data: {
      salesRevenue, taxes, otherIncome, totalRevenue, costOfGoods: cogs, operatingExpenses, totalExpenses, netIncome, period
    }});
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/:bizId/cash-flow
router.get('/:bizId/cash-flow', requireViewer, async (req, res) => {
  const { bizId } = req.params;
  const { period = 'month' } = req.query;
  try {
    const { sales, expenses } = await getBizData(bizId, period);
    const grossSales = sales.reduce((a,s) => a + (parseFloat(s.total)||0), 0);
    const taxRate = await getBizTaxRate(bizId);
    const taxes = calcTaxes(sales, grossSales, taxRate);
    const netSales = grossSales - taxes;
    const receipts = netSales + expenses.filter(e => e.type === 'income').reduce((a,e) => a + (parseFloat(e.amount)||0), 0);
    const payments = expenses.filter(e => e.type === 'expense').reduce((a,e) => a + (parseFloat(e.amount)||0), 0);
    const netOperating = receipts - payments;
    
    const equipmentPurchase = expenses.filter(e => e.type === 'expense' && (e.category||'').toLowerCase().includes('equip')).reduce((a,e) => a + (parseFloat(e.amount)||0), 0);
    
    res.json({ success: true, data: {
      operatingActivities: { salesReceipts: receipts, expensePayments: payments, netOperating },
      investingActivities: { equipmentPurchase, netInvesting: -equipmentPurchase },
      openingBalance: 0,
      closingBalance: netOperating - equipmentPurchase,
      period
    }});
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/:bizId/balance-summary
router.get('/:bizId/balance-summary', requireViewer, async (req, res) => {
  const { bizId } = req.params;
  try {
    const { sales, expenses, inventory } = await getBizData(bizId, null);
    
    const grossSales = sales.reduce((a,s) => a + (parseFloat(s.total)||0), 0);
    const taxRate = await getBizTaxRate(bizId);
    const taxes = calcTaxes(sales, grossSales, taxRate);
    const netSales = grossSales - taxes;
    const otherIncome = expenses.filter(e => e.type === 'income').reduce((a,e) => a + (parseFloat(e.amount)||0), 0);
    const payments = expenses.filter(e => e.type === 'expense').reduce((a,e) => a + (parseFloat(e.amount)||0), 0);
    
    const cash = Math.max(0, netSales + otherIncome - payments);
    const invValue = inventory.reduce((a,i) => a + ((parseFloat(i.unitCost)||0) * (parseInt(i.quantity)||0)), 0);
    const totalAssets = cash + invValue;
    
    // No AR/AP tracking — set to 0 with note
    const receivables = 0;
    const payables = 0;
    const totalLiabilities = 0;
    const equity = totalAssets;
    
    res.json({ success: true, data: {
      assets: { cash, inventory: invValue, receivables, totalAssets },
      liabilities: { payables, totalLiabilities },
      equity
    }});
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/reports/all/comparison
router.get('/all/comparison', requireViewer, async (req, res) => {
  try {
    const comparison = [];
    const catsMap = { RENTAL: 'Rental', BUSINESS: 'Business', AGRI: 'Agriculture', NON_AGRI: 'Non-Agriculture', MAIN: 'Main' };
    
    let totalRev = 0;
    let totalExp = 0;
    let totalProf = 0;
    
    for (const bizId of BIZ_CATEGORIES) {
      const { sales, expenses, inventory } = await getBizData(bizId, null);
      const grossSales = sales.reduce((a,s) => a + (parseFloat(s.total)||0), 0);
      const taxRate = await getBizTaxRate(bizId);
      const taxes = calcTaxes(sales, grossSales, taxRate);
      const netSales = grossSales - taxes;
      const rev = netSales + expenses.filter(e => e.type === 'income').reduce((a,e) => a + (parseFloat(e.amount)||0), 0);
      const cogs = computeCOGS(sales, inventory);
      const opExp = expenses.filter(e => e.type === 'expense').reduce((a,e) => a + (parseFloat(e.amount)||0), 0);
      const prof = rev - cogs - opExp;
      
      totalRev += rev;
      totalExp += cogs + opExp;
      totalProf += prof;
      
      comparison.push({
        category: catsMap[bizId],
        revenue: rev,
        expenses: cogs + opExp,
        profit: prof,
        margin: rev > 0 ? ((prof / rev) * 100).toFixed(1) + '%' : '0.0%'
      });
    }
    
    const totals = {
      revenue: totalRev,
      expenses: totalExp,
      profit: totalProf,
      margin: totalRev > 0 ? ((totalProf / totalRev) * 100).toFixed(1) + '%' : '0.0%'
    };
    
    res.json({ success: true, data: { comparison, totals } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
