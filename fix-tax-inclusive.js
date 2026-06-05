const fs = require('fs');

// 1. Employee Sales
let emp = fs.readFileSync('views/employee/sales.html', 'utf8');
emp = emp.replace(
`      const taxAmount = subtotal * (rate / 100);
      const total = subtotal + taxAmount;`,
`      const total = subtotal; // selling price is inclusive of tax
      const taxAmount = total * (rate / 100);
      subtotal = total - taxAmount;`
);

// Fix onQuickScanSuccess
emp = emp.replace(
`      const rate = taxRates[BIZ] || 0;
      const subtotal = product.sellingPrice;
      const taxAmount = subtotal * (rate / 100);
      const total = subtotal + taxAmount;`,
`      const rate = taxRates[BIZ] || 0;
      const total = product.sellingPrice;
      const taxAmount = total * (rate / 100);
      const subtotal = total - taxAmount;`
);

// In employee receipt, display correctly:
emp = emp.replace(
`      const taxHtml = (s.taxAmount > 0) ? \`<tr><td colspan="2">Subtotal</td><td style="text-align:right">P\${parseFloat(s.subtotal || s.total - s.taxAmount).toFixed(2)}</td></tr>
      <tr><td colspan="2">Tax (\${s.taxRate||0}%)</td><td style="text-align:right">P\${parseFloat(s.taxAmount).toFixed(2)}</td></tr>\` : '';`,
`      const taxHtml = (s.taxAmount > 0) ? \`<tr><td colspan="2">Net Subtotal</td><td style="text-align:right">P\${parseFloat(s.subtotal).toFixed(2)}</td></tr>
      <tr><td colspan="2">Tax Collected (\${s.taxRate||0}%)</td><td style="text-align:right">P\${parseFloat(s.taxAmount).toFixed(2)}</td></tr>\` : '';`
);

fs.writeFileSync('views/employee/sales.html', emp, 'utf8');

// 2. Manager Sales
let mgr = fs.readFileSync('views/manager/sales.html', 'utf8');
mgr = mgr.replace(
`  const subtotal = price * qty;
  const rate = taxRates[BIZ] || 0;
  const taxAmount = subtotal * (rate / 100);
  try {
    const res = await API.post('/api/sales', {
      items: [{ id: productId, name: productName, quantity: qty, unitPrice: price, subtotal }],
      subtotal,
      taxRate: rate,
      taxAmount,
      total: subtotal + taxAmount,`,
`  const total = price * qty;
  const rate = taxRates[BIZ] || 0;
  const taxAmount = total * (rate / 100);
  const subtotal = total - taxAmount;
  try {
    const res = await API.post('/api/sales', {
      items: [{ id: productId, name: productName, quantity: qty, unitPrice: price, subtotal: total }],
      subtotal,
      taxRate: rate,
      taxAmount,
      total,`
);
fs.writeFileSync('views/manager/sales.html', mgr, 'utf8');

// 3. Admin Sales
let adm = fs.readFileSync('views/admin/sales.html', 'utf8');

// Add KPI for tax
const kpiSearch = `          <div class="kpi-card danger">
            <div class="kpi-label">Cash Sales</div>`;
const kpiInsert = `          <div class="kpi-card" style="background:#f4ebff;color:#6b3fa0;border-left:4px solid #6b3fa0">
            <div class="kpi-label">Tax Collected</div>
            <div class="kpi-value" id="kpiTax" style="color:#6b3fa0">₱0.00</div>
            <div class="kpi-icon"><svg width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
          </div>
          <div class="kpi-card danger">
            <div class="kpi-label">Cash Sales</div>`;
if (adm.includes(kpiSearch)) {
  adm = adm.replace(kpiSearch, kpiInsert);
  adm = adm.replace(`style="grid-template-columns: repeat(4,1fr)"`, `style="grid-template-columns: repeat(5,1fr)"`);
}

// Update updateKPI
adm = adm.replace(
`      document.getElementById('kpiAvg').textContent = list.length ? fmt.currency(total / list.length) : '₱0.00';
      document.getElementById('kpiCash').textContent = cash;`,
`      document.getElementById('kpiAvg').textContent = list.length ? fmt.currency(total / list.length) : '₱0.00';
      document.getElementById('kpiCash').textContent = cash;
      const tax = list.reduce((s, x) => s + (x.taxAmount || 0), 0);
      if (document.getElementById('kpiTax')) document.getElementById('kpiTax').textContent = fmt.currency(tax);`
);

// Fix calcTotal logic
adm = adm.replace(
`      const rate = taxRates[currentBiz] || 0;
      const tax = subtotal * (rate / 100);
      const total = subtotal + tax;
      document.getElementById('subtotalDisplay').textContent = fmt.currency(subtotal);
      document.getElementById('taxRateDisplay').textContent = rate;
      document.getElementById('taxDisplay').textContent = fmt.currency(tax);
      document.getElementById('totalDisplay').textContent = fmt.currency(total);`,
`      const rate = taxRates[currentBiz] || 0;
      const total = subtotal; // subtotal var holds total price * qty
      const tax = total * (rate / 100);
      const netSubtotal = total - tax;
      document.getElementById('subtotalDisplay').textContent = fmt.currency(netSubtotal);
      document.getElementById('taxRateDisplay').textContent = rate;
      document.getElementById('taxDisplay').textContent = fmt.currency(tax);
      document.getElementById('totalDisplay').textContent = fmt.currency(total);`
);

// Fix submitSale logic
adm = adm.replace(
`      const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const rate = taxRates[currentBiz] || 0;
      const taxAmount = subtotal * (rate / 100);

      const data = {
        items,
        subtotal,
        taxRate: rate,
        taxAmount,
        total: subtotal + taxAmount,`,
`      const total = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const rate = taxRates[currentBiz] || 0;
      const taxAmount = total * (rate / 100);
      const subtotal = total - taxAmount;

      const data = {
        items,
        subtotal,
        taxRate: rate,
        taxAmount,
        total,`
);

fs.writeFileSync('views/admin/sales.html', adm, 'utf8');

console.log('Fixed tax logic to be inclusive');
