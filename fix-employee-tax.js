const fs = require('fs');

const p = 'views/employee/sales.html';
let content = fs.readFileSync(p, 'utf8');

// Fix calcSaleTotal
content = content.replace(
`    function calcSaleTotal() {
      let total = 0;
      document.querySelectorAll('.sale-item').forEach(row => {
        const qty = parseFloat(row.querySelector('.si-qty').value) || 0;
        const price = parseFloat(row.querySelector('.si-price').value) || 0;
        total += qty * price;
      });
      document.getElementById('saleTotal').innerHTML = '&#8369;' + total.toLocaleString('en', { minimumFractionDigits: 2 });
    }`,
`    function calcSaleTotal() {
      let subtotal = 0;
      document.querySelectorAll('.sale-item').forEach(row => {
        const qty = parseFloat(row.querySelector('.si-qty').value) || 0;
        const price = parseFloat(row.querySelector('.si-price').value) || 0;
        subtotal += qty * price;
      });
      const rate = taxRates[BIZ] || 0;
      const taxAmount = subtotal * (rate / 100);
      const total = subtotal + taxAmount;
      document.getElementById('saleTotal').innerHTML = '&#8369;' + total.toLocaleString('en', { minimumFractionDigits: 2 }) + (rate > 0 ? \` <small style="font-size:0.75rem;color:var(--gray-500);">(incl. \${rate}% tax)</small>\` : '');
      return { subtotal, taxAmount, total, rate };
    }`
);

// Fix saveSale
content = content.replace(
`      const data = {
        items, total,
        paymentMethod: document.getElementById('s_payment').value,
        notes: document.getElementById('s_notes').value,
        businessCategory: BIZ,
        date: new Date().toISOString(),
      };`,
`      const { subtotal, taxAmount, total: computedTotal, rate } = calcSaleTotal();
      const data = {
        items, subtotal, taxAmount, taxRate: rate, total: computedTotal,
        paymentMethod: document.getElementById('s_payment').value,
        notes: document.getElementById('s_notes').value,
        businessCategory: BIZ,
        date: new Date().toISOString(),
      };`
);

// Fix onQuickScanSuccess
content = content.replace(
`      const data = {
        items: [{
          id: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.sellingPrice,
          subtotal: product.sellingPrice
        }],
        total: product.sellingPrice,
        paymentMethod: 'cash',
        notes: 'Auto-recorded via QR Webcam scan',
        businessCategory: BIZ,
      };`,
`      const rate = taxRates[BIZ] || 0;
      const subtotal = product.sellingPrice;
      const taxAmount = subtotal * (rate / 100);
      const total = subtotal + taxAmount;

      const data = {
        items: [{
          id: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: product.sellingPrice,
          subtotal: product.sellingPrice
        }],
        subtotal,
        taxAmount,
        taxRate: rate,
        total,
        paymentMethod: 'cash',
        notes: 'Auto-recorded via QR Webcam scan',
        businessCategory: BIZ,
      };`
);

// Fix printReceipt
content = content.replace(
`    function printReceipt(id) {
      const s = sales.find(x => x.id === id);
      if (!s) return;
      const w = window.open('', '_blank', 'width=400,height=600');
      w.document.write(\`<html><head><title>Receipt</title><style>body{font-family:'Courier New',monospace;padding:20px;font-size:12px;} .center{text-align:center;} hr{border:none;border-top:1px dashed #000;} table{width:100%;border-collapse:collapse;} td{padding:2px 4px;}</style></head><body>
    <div class="center"><strong>PSAU - Office of Business Affairs</strong><br>\${meta.name} Category<br>Receipt</div><hr>
    <p>Date: \${new Date(s.date).toLocaleString()}<br>Payment: \${s.paymentMethod || 'cash'}</p><hr>
    <table>\${(s.items || []).map(i => '<tr><td>' + i.name + '</td><td>x' + i.quantity + '</td><td style="text-align:right">P' + parseFloat(i.subtotal || 0).toFixed(2) + '</td></tr>').join('')}
    <tr><td colspan="3"><hr></td></tr>
    <tr><td colspan="2"><strong>TOTAL</strong></td><td style="text-align:right"><strong>P\${parseFloat(s.total || 0).toFixed(2)}</strong></td></tr></table>
    <hr><div class="center">Thank you!<br>OBA System</div>
  </body></html>\`);
      w.document.close(); w.print();
    }`,
`    function printReceipt(id) {
      const s = sales.find(x => x.id === id);
      if (!s) return;
      
      const taxHtml = (s.taxAmount > 0) ? \`<tr><td colspan="2">Subtotal</td><td style="text-align:right">P\${parseFloat(s.subtotal || s.total - s.taxAmount).toFixed(2)}</td></tr>
      <tr><td colspan="2">Tax (\${s.taxRate||0}%)</td><td style="text-align:right">P\${parseFloat(s.taxAmount).toFixed(2)}</td></tr>\` : '';

      const w = window.open('', '_blank', 'width=400,height=600');
      w.document.write(\`<html><head><title>Receipt</title><style>body{font-family:'Courier New',monospace;padding:20px;font-size:12px;} .center{text-align:center;} hr{border:none;border-top:1px dashed #000;} table{width:100%;border-collapse:collapse;} td{padding:2px 4px;}</style></head><body>
    <div class="center"><strong>PSAU - Office of Business Affairs</strong><br>\${meta.name} Category<br>Receipt</div><hr>
    <p>Date: \${new Date(s.date).toLocaleString()}<br>Payment: \${s.paymentMethod || 'cash'}</p><hr>
    <table>\${(s.items || []).map(i => '<tr><td>' + i.name + '</td><td>x' + (i.quantity||i.qty) + '</td><td style="text-align:right">P' + parseFloat(i.subtotal || (i.unitPrice*(i.quantity||i.qty)) || 0).toFixed(2) + '</td></tr>').join('')}
    <tr><td colspan="3"><hr></td></tr>
    \${taxHtml}
    <tr><td colspan="2"><strong>TOTAL</strong></td><td style="text-align:right"><strong>P\${parseFloat(s.total || 0).toFixed(2)}</strong></td></tr></table>
    <hr><div class="center">Thank you!<br>OBA System</div>
  </body></html>\`);
      w.document.close(); w.focus(); setTimeout(() => { w.print(); }, 200);
    }`
);

fs.writeFileSync(p, content, 'utf8');
console.log('Fixed tax logic in employee/sales');
