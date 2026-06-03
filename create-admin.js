require('dotenv').config();
const { auth, db } = require('./config/firebase');

async function createDefaultAdmin() {
  if (!auth || !db) {
    console.error('❌ Firebase is not configured properly in .env');
    process.exit(1);
  }

  const email = 'admin@psau.edu.ph';
  const password = 'adminPassword123';
  const name = 'Default Admin';

  try {
    let userRecord;
    try {
      // Check if user already exists
      userRecord = await auth.getUserByEmail(email);
      console.log('User already exists in Firebase Auth:', userRecord.uid);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        // Create new user in Firebase Auth
        userRecord = await auth.createUser({
          email,
          password,
          displayName: name,
        });
        console.log('✅ Successfully created new admin user in Firebase Auth:', userRecord.uid);
      } else {
        throw e;
      }
    }

    // Add admin role to Realtime Database
    await db.ref(`users/${userRecord.uid}`).set({
      name,
      email,
      role: 'admin',
      businesses: ['all'],
      status: 'active',
      createdAt: new Date().toISOString(),
    });

    console.log('✅ Successfully added admin permissions to Firestore!');
    console.log('\n=======================================');
    console.log('You can now log in with:');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('=======================================\n');
    console.log('Note: After logging in and creating other accounts, you can delete this script and remove this admin account from the Firebase Console if you wish.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
}

createDefaultAdmin();
