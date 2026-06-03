require('dotenv').config();
const { auth, db } = require('./config/firebase');

const MANAGERS = [
  {
    email: 'rental_manager@psau.edu.ph',
    name: 'Rental Category Manager',
    businesses: ['RENTAL']
  },
  {
    email: 'business_manager@psau.edu.ph',
    name: 'Business Category Manager',
    businesses: ['BUSINESS']
  },
  {
    email: 'agri_manager@psau.edu.ph',
    name: 'Agri Category Manager',
    businesses: ['AGRI']
  },
  {
    email: 'nonagri_manager@psau.edu.ph',
    name: 'Non-Agri Category Manager',
    businesses: ['NON_AGRI']
  }
];

const DEFAULT_PASSWORD = 'managerPassword123';

async function createCategoryManagers() {
  if (!auth || !db) {
    console.error('❌ Firebase is not configured properly in .env');
    process.exit(1);
  }

  console.log('🚀 Starting manager accounts creation...');

  for (const mgr of MANAGERS) {
    try {
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(mgr.email);
        console.log(`ℹ️ User ${mgr.email} already exists in Firebase Auth: ${userRecord.uid}`);
      } catch (e) {
        if (e.code === 'auth/user-not-found') {
          userRecord = await auth.createUser({
            email: mgr.email,
            password: DEFAULT_PASSWORD,
            displayName: mgr.name,
          });
          console.log(`✅ Successfully created ${mgr.name} in Firebase Auth: ${userRecord.uid}`);
        } else {
          throw e;
        }
      }

      // Add to users node in DB
      await db.ref(`users/${userRecord.uid}`).set({
        name: mgr.name,
        email: mgr.email,
        role: 'manager',
        businesses: mgr.businesses,
        status: 'active',
        createdAt: new Date().toISOString(),
      });

      console.log(`✅ Successfully added DB permissions for ${mgr.name}`);
    } catch (error) {
      console.error(`❌ Error creating ${mgr.name}:`, error.message);
    }
  }

  console.log('\n=======================================');
  console.log('Successfully seeded all manager accounts!');
  console.log(`Default Password: ${DEFAULT_PASSWORD}`);
  console.log('Manager Accounts:');
  MANAGERS.forEach(m => {
    console.log(`- ${m.name} (${m.email}) -> Business Access: ${m.businesses.join(', ')}`);
  });
  console.log('=======================================\n');
  process.exit(0);
}

createCategoryManagers();
