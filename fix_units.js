const { db } = require('./config/firebase.js');

if (!db) {
  console.log('No DB');
  process.exit(0);
}

db.ref('inventory').once('value').then(snap => {
  const data = snap.val();
  if (!data) return process.exit(0);

  const updates = {};
  for (const cat in data) {
    for (const id in data[cat]) {
      const prod = data[cat][id];
      if (prod.unit === '10' || prod.unit === 10 || parseInt(prod.unit) == prod.unit) {
        updates[`inventory/${cat}/${id}/unit`] = '';
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    db.ref().update(updates).then(() => {
      console.log('Fixed unit data:', updates);
      process.exit(0);
    });
  } else {
    console.log('No broken units found');
    process.exit(0);
  }
});
