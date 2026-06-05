const fs = require('fs');

const files = [
  'views/admin/sales.html',
  'views/manager/sales.html',
  'views/employee/sales.html'
];

files.forEach(p => {
  let content = fs.readFileSync(p, 'utf8');
  let changed = false;

  // Update the Filter button
  if (content.includes('onclick="loadData()">Filter</button>')) {
    content = content.replace('onclick="loadData()">Filter</button>', 'onclick="renderTable()">Filter</button>');
    changed = true;
  }

  // Update the renderTable function
  const oldRender = `function renderTable() {
      const search = document.getElementById('fSearch').value.toLowerCase();
      let list = sales;
      if (search) list = list.filter(s => JSON.stringify(s).toLowerCase().includes(search));
      const el = document.getElementById('salesTable');`;

  const newRender = `function renderTable() {
      const search = document.getElementById('fSearch').value.toLowerCase();
      const dateFrom = document.getElementById('fDateFrom') ? document.getElementById('fDateFrom').value : '';
      const dateTo = document.getElementById('fDateTo') ? document.getElementById('fDateTo').value : '';

      let list = sales;
      if (search) list = list.filter(s => JSON.stringify(s).toLowerCase().includes(search));
      if (dateFrom) list = list.filter(s => (s.date || '') >= dateFrom);
      if (dateTo) list = list.filter(s => (s.date || '') <= dateTo + 'T23:59:59.999Z');

      const el = document.getElementById('salesTable');`;

  // employee view might have a different indent
  const oldRenderAlt = `function renderTable() {
  const search = document.getElementById('fSearch').value.toLowerCase();
  let list = sales;
  if (search) list = list.filter(s => JSON.stringify(s).toLowerCase().includes(search));
  const el = document.getElementById('salesTable');`;

  const newRenderAlt = `function renderTable() {
  const search = document.getElementById('fSearch').value.toLowerCase();
  const dateFrom = document.getElementById('fDateFrom') ? document.getElementById('fDateFrom').value : '';
  const dateTo = document.getElementById('fDateTo') ? document.getElementById('fDateTo').value : '';

  let list = sales;
  if (search) list = list.filter(s => JSON.stringify(s).toLowerCase().includes(search));
  if (dateFrom) list = list.filter(s => (s.date || '') >= dateFrom);
  if (dateTo) list = list.filter(s => (s.date || '') <= dateTo + 'T23:59:59.999Z');

  const el = document.getElementById('salesTable');`;

  if (content.includes(oldRender)) {
    content = content.replace(oldRender, newRender);
    changed = true;
  } else if (content.includes(oldRenderAlt)) {
    content = content.replace(oldRenderAlt, newRenderAlt);
    changed = true;
  } else {
    // maybe flexible spacing
    const regex = /function renderTable\(\) \{\s*const search = document\.getElementById\('fSearch'\)\.value\.toLowerCase\(\);\s*let list = sales;\s*if \(search\) list = list\.filter\(s => JSON\.stringify\(s\)\.toLowerCase\(\)\.includes\(search\)\);\s*const el = document\.getElementById\('salesTable'\);/
    if (regex.test(content)) {
      content = content.replace(regex, newRender);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(p, content, 'utf8');
    console.log('Fixed', p);
  } else {
    console.log('No changes in', p);
  }
});
