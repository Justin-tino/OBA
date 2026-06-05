const fs = require('fs');

const adminPath = 'views/admin/sales.html';
let content = fs.readFileSync(adminPath, 'utf8');

// 1. Change Filter button from loadSales() to renderTable()
content = content.replace('onclick="loadSales()">', 'onclick="renderTable()">');

// 2. Change loadSales to not pass filter params
content = content.replace(
`    async function loadSales() {
      const params = {};
      const start = document.getElementById('fStart').value;
      const end = document.getElementById('fEnd').value;
      const pay = document.getElementById('fPayment').value;
      if (start) params.startDate = start;
      if (end) params.endDate = end;
      if (pay) params.paymentType = pay;
      params.biz = currentBiz;
      try {
        const res = await API.get(\`/api/sales\`, params);
        if (res.success) { allSales = res.data; renderTable(); updateKPI(); }
      } catch (e) { Toast.error('Failed to load sales.'); }
    }`,
`    async function loadSales() {
      try {
        const res = await API.get(\`/api/sales\`, { biz: currentBiz });
        if (res.success) { allSales = res.data; renderTable(); }
      } catch (e) { Toast.error('Failed to load sales.'); }
    }`
);

// 3. Update updateKPI to accept list
content = content.replace(
`    function updateKPI() {
      const total = allSales.reduce((s, x) => s + x.total, 0);
      const cash = allSales.filter(s => s.paymentMethod === 'cash').length;
      document.getElementById('kpiRev').textContent = fmt.currency(total);
      document.getElementById('kpiTxn').textContent = allSales.length;
      document.getElementById('kpiAvg').textContent = allSales.length ? fmt.currency(total / allSales.length) : '₱0.00';
      document.getElementById('kpiCash').textContent = cash;
    }`,
`    function updateKPI(list = allSales) {
      const total = list.reduce((s, x) => s + x.total, 0);
      const cash = list.filter(s => s.paymentMethod === 'cash').length;
      document.getElementById('kpiRev').textContent = fmt.currency(total);
      document.getElementById('kpiTxn').textContent = list.length;
      document.getElementById('kpiAvg').textContent = list.length ? fmt.currency(total / list.length) : '₱0.00';
      document.getElementById('kpiCash').textContent = cash;
    }`
);

// 4. Update renderTable
content = content.replace(
`    function renderTable() {
      const start = (currentPage - 1) * PER_PAGE;
      const page = allSales.slice(start, start + PER_PAGE);
      const wrap = document.getElementById('salesTableWrap');
      if (!allSales.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div><h3>No sales found</h3><p>Record the first sale or adjust your filters</p></div>'; renderPagination(); return; }`,
`    let filteredSales = [];
    function renderTable() {
      const startD = document.getElementById('fStart').value;
      const endD = document.getElementById('fEnd').value;
      const pay = document.getElementById('fPayment').value;
      
      let list = allSales;
      if (startD) list = list.filter(s => (s.date||'') >= startD);
      if (endD) list = list.filter(s => (s.date||'') <= endD + 'T23:59:59.999Z');
      if (pay) list = list.filter(s => s.paymentMethod === pay);
      
      filteredSales = list;
      updateKPI(list);

      const start = (currentPage - 1) * PER_PAGE;
      const page = list.slice(start, start + PER_PAGE);
      const wrap = document.getElementById('salesTableWrap');
      if (!list.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div><h3>No sales found</h3><p>Record the first sale or adjust your filters</p></div>'; renderPagination(); return; }`
);

// 5. Update renderPagination
content = content.replace(
`    function renderPagination() {
      const total = Math.ceil(allSales.length / PER_PAGE);`,
`    function renderPagination() {
      const total = Math.ceil(filteredSales.length / PER_PAGE);`
);

// 6. Update clearFilters to renderTable
content = content.replace(
`    function clearFilters() {
      ['fStart', 'fEnd', 'fPayment'].forEach(id => document.getElementById(id).value = '');
      loadSales();
    }`,
`    function clearFilters() {
      ['fStart', 'fEnd', 'fPayment'].forEach(id => document.getElementById(id).value = '');
      currentPage = 1;
      renderTable();
    }`
);

fs.writeFileSync(adminPath, content, 'utf8');
console.log('Fixed admin sales');
