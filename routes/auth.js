/**
 * routes/auth.js
 * Authentication routes: login, logout, signup with OTP, session management
 * Fully integrated with Firebase Auth + Firestore
 */
const express = require('express');
const router = express.Router();
const { auth, db } = require('../config/firebase');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000
});

// Demo users for development (fallback when Firebase is not connected)
const DEMO_USERS = [];

// GET /login
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return redirectByRole(res, req.session.user.role, req.session.user.businessAccess);
  }
  res.sendFile('login.html', { root: './views/auth' });
});

// GET /forgot-password
router.get('/forgot-password', (req, res) => {
  res.sendFile('forgot-password.html', { root: './views/auth' });
});

// GET /reset-password
router.get('/reset-password', (req, res) => {
  res.sendFile('reset-password.html', { root: './views/auth' });
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password, idToken, selectedRole, selectedCategory } = req.body;

  try {
    // ─── Firebase mode (Admin SDK available) ───
    if (auth && db && idToken) {
      const decoded = await auth.verifyIdToken(idToken);
      const uid = decoded.uid;

      // Fetch user profile from Realtime DB 'users' node
      const userSnap = await db.ref(`users/${uid}`).once('value');
      if (!userSnap.exists()) {
        return res.json({ success: false, message: 'Account not found in system. Please contact the admin or request access.' });
      }
      const userData = userSnap.val();
      if (userData.status === 'pending') {
        return res.json({ success: false, message: 'Account requested, wait for admin approval.' });
      }
      if (userData.status === 'suspended') {
        return res.json({ success: false, message: 'Your account has been suspended. Contact admin.' });
      }
      if (userData.status === 'inactive') {
        return res.json({ success: false, message: 'Your account is inactive. Contact admin to reactivate.' });
      }

      // Map old 'admin' role to 'super_admin'
      const normalizedRole = userData.role === 'admin' ? 'super_admin' : (userData.role || 'viewer');

      // ─── Strict role enforcement ───
      if (selectedRole) {
        const roleMap = {
          'admin': ['super_admin', 'admin'],
          'manager': ['manager'],
          'employee': ['employee'],
          'viewer': ['viewer']
        };
        const allowedRoles = roleMap[selectedRole] || [];
        if (!allowedRoles.includes(normalizedRole)) {
          return res.json({ success: false, message: `Your account is registered as "${normalizedRole}". Please go back and select the correct role.` });
        }
      }

      req.session.user = {
        uid,
        email: decoded.email,
        role: normalizedRole,
        name: userData.name || decoded.email,
        businessAccess: userData.businesses || ['all'],
        selectedCategory: selectedCategory || null,
      };

      // Log to audit trail
      await logAudit(uid, decoded.email, userData.name || decoded.email, 'LOGIN', 'auth', 'User logged in successfully');

      return res.json({ success: true, role: normalizedRole, redirect: getRoleRedirect(normalizedRole, userData.businesses, selectedCategory) });
    }

    // ─── Firebase mode WITHOUT Admin SDK (decode JWT manually) ───
    if (!auth && idToken) {
      try {
        const payload = idToken.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));

        // Try to look up user in Firestore if db is available
        if (db) {
          const userSnap = await db.ref(`users/${decoded.user_id}`).once('value');
          if (userSnap.exists()) {
            const userData = userSnap.val();
            
            if (userData.status === 'pending') return res.json({ success: false, message: 'Account requested, wait for admin approval.' });
            if (userData.status === 'suspended') return res.json({ success: false, message: 'Your account has been suspended.' });
            if (userData.status === 'inactive') return res.json({ success: false, message: 'Your account is inactive.' });

            const normRole = userData.role === 'admin' ? 'super_admin' : (userData.role || 'viewer');

            // ─── Strict role enforcement ───
            if (selectedRole) {
              const roleMap = { 'admin': ['super_admin', 'admin'], 'manager': ['manager'], 'employee': ['employee'], 'viewer': ['viewer'] };
              const allowedRoles = roleMap[selectedRole] || [];
              if (!allowedRoles.includes(normRole)) {
                return res.json({ success: false, message: `Your account is registered as "${normRole}". Please go back and select the correct role.` });
              }
            }

            req.session.user = {
              uid: decoded.user_id,
              email: decoded.email,
              role: normRole,
              name: userData.name || decoded.email,
              businessAccess: userData.businesses || ['all'],
              selectedCategory: selectedCategory || null,
            };
            return res.json({ success: true, role: normRole, redirect: getRoleRedirect(normRole, userData.businesses, selectedCategory) });
          }
        }

        // Fallback: create session with basic info
        req.session.user = {
          uid: decoded.user_id,
          email: decoded.email,
          role: 'admin',
          name: decoded.email,
          businessAccess: 'all'
        };
        return res.json({ success: true, role: 'admin', redirect: '/admin/dashboard' });
      } catch (e) {
        return res.json({ success: false, message: 'Invalid authentication token.' });
      }
    }

    // ─── Demo mode (no Firebase) ───
    const user = DEMO_USERS.find(u => u.email === email && u.password === password);
    if (!user) {
      return res.json({ success: false, message: 'Invalid email or password.' });
    }
    if (user.status === 'inactive') {
      return res.json({ success: false, message: 'Your account is inactive. Contact admin to reactivate.' });
    }
    req.session.user = {
      uid: user.uid,
      email: user.email,
      role: user.role,
      name: user.name,
      businessAccess: user.businessAccess,
    };
    return res.json({ success: true, role: user.role, redirect: getRoleRedirect(user.role, user.businessAccess) });

  } catch (err) {
    console.error('Login error:', err);
    res.json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// POST /logout
router.post('/logout', (req, res) => {
  const user = req.session?.user;
  if (user && db) {
    logAudit(user.uid, user.email, user.name, 'LOGOUT', 'auth', 'User logged out');
  }
  req.session.destroy(() => { res.redirect('/login'); });
});

// GET /logout
router.get('/logout', (req, res) => {
  const user = req.session?.user;
  if (user && db) {
    logAudit(user.uid, user.email, user.name, 'LOGOUT', 'auth', 'User logged out');
  }
  req.session.destroy(() => { res.redirect('/login'); });
});

// GET /request-access (signup page) — kept for backward compat
router.get('/request-access', (req, res) => {
  res.sendFile('request-access.html', { root: './views/auth' });
});

// ═══════════════════════════════════════════════════════════════════
// SIGNUP FLOW: Step 1 — Send OTP to email for verification
// ═══════════════════════════════════════════════════════════════════
router.post('/api/signup/send-otp', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) return res.json({ success: false, message: 'Name and email are required.' });

  try {
    if (!db) return res.json({ success: false, message: 'Database not configured.' });

    // Check if email already exists in Firebase Auth
    if (auth) {
      try {
        await auth.getUserByEmail(email);
        return res.json({ success: false, message: 'An account with this email already exists.' });
      } catch (e) {
        // Good — email not yet registered
      }
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP temporarily keyed by email
    const emailKey = email.replace(/\./g, '_dot_').replace(/@/g, '_at_');
    await db.ref(`signupOtps/${emailKey}`).set({ otp, expiresAt, name, email });

    // Send OTP email
    const mailOptions = {
      from: `"OBA System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'OBA System - Email Verification OTP',
      text: `Your OTP for account registration is: ${otp}\nIt is valid for 10 minutes.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:30px;">
          <h2 style="color:#2d6a2e;">OBA System — Email Verification</h2>
          <p>Hi <strong>${name}</strong>,</p>
          <p>Your OTP for account registration is:</p>
          <div style="background:#f5f5f5;padding:20px;text-align:center;border-radius:8px;margin:20px 0;">
            <span style="font-size:32px;font-weight:800;letter-spacing:8px;color:#2d6a2e;">${otp}</span>
          </div>
          <p style="color:#666;">This code is valid for <strong>10 minutes</strong>.</p>
          <p style="color:#999;font-size:12px;">If you didn't request this, please ignore this email.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return res.json({ success: true, message: 'OTP sent to your email. Please check your inbox.' });
  } catch (err) {
    console.error('Signup OTP Send Error:', err);
    return res.json({ success: false, message: 'Failed to send OTP. Please try again.' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// SIGNUP FLOW: Step 2 — Verify OTP & Create Account (pending approval)
// ═══════════════════════════════════════════════════════════════════
router.post('/api/signup/verify-and-register', async (req, res) => {
  const { email, name, password, otp, position, businessUnit } = req.body;
  if (!email || !name || !password || !otp) {
    return res.json({ success: false, message: 'All fields are required.' });
  }
  if (password.length < 6) {
    return res.json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  try {
    if (!db) return res.json({ success: false, message: 'Database not configured.' });

    // Verify OTP
    const emailKey = email.replace(/\./g, '_dot_').replace(/@/g, '_at_');
    const otpSnap = await db.ref(`signupOtps/${emailKey}`).once('value');

    if (!otpSnap.exists()) {
      return res.json({ success: false, message: 'No OTP found. Please request a new one.' });
    }

    const otpData = otpSnap.val();
    if (Date.now() > otpData.expiresAt) {
      await db.ref(`signupOtps/${emailKey}`).remove();
      return res.json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (otpData.otp !== otp) {
      return res.json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    // OTP verified — create Firebase Auth account
    let userRecord;
    if (auth) {
      try {
        userRecord = await auth.createUser({
          email,
          password,
          displayName: name,
        });
      } catch (authErr) {
        if (authErr.code === 'auth/email-already-exists') {
          return res.json({ success: false, message: 'An account with this email already exists.' });
        }
        throw authErr;
      }
    } else {
      userRecord = { uid: 'user-' + Date.now() };
    }

    // Save access request
    await db.ref('accessRequests').push({
      uid: userRecord.uid,
      name,
      email,
      position: position || '',
      businessUnit: businessUnit || '',
      status: 'pending',
      date: new Date().toLocaleDateString('en-PH'),
      createdAt: new Date().toISOString(),
    });

    // Create user doc as pending
    await db.ref(`users/${userRecord.uid}`).set({
      name,
      email,
      role: 'employee',
      businesses: [businessUnit || 'RENTAL'],
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    // Clean up OTP
    await db.ref(`signupOtps/${emailKey}`).remove();

    await logAudit(userRecord.uid, email, name, 'SIGNUP', 'auth', `New account created by ${name} (${email}) — pending admin approval`);

    return res.json({ success: true, message: 'Account created successfully! Please wait for admin approval before you can login.' });
  } catch (err) {
    console.error('Signup error:', err);
    res.json({ success: false, message: 'Failed to create account. ' + err.message });
  }
});

// POST /request-access (legacy signup — redirect to new flow)
router.post('/request-access', async (req, res) => {
  return res.json({ success: false, message: 'Please use the signup form on the login page.' });
});

// POST /api/forgot-password/send-link — Generates a magic reset link and sends email
router.post('/api/forgot-password/send-link', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.json({ success: false, message: 'Email is required.' });

  try {
    if (!auth || !db) {
      return res.json({ success: false, message: 'Database not initialized.' });
    }

    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (e) {
      return res.json({ success: false, message: 'No registered account found with this email.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes from now

    await db.ref(`passwordResets/${token}`).set({
      email,
      expiresAt
    });

    const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;

    const mailOptions = {
      from: `"OBA System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'OBA System - Password Reset Request',
      text: `You requested a password reset. Please click the link below to set a new password (valid for 10 minutes):\n\n${resetLink}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2d6a2e; text-align: center;">OBA Password Reset</h2>
          <p>Hello,</p>
          <p>We received a request to reset the password for your Office of Business Affairs (OBA) account.</p>
          <p>Please click the button below to set a new password. This reset link is only valid for <strong>10 minutes</strong>:</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetLink}" style="display: inline-block; background: linear-gradient(135deg, #2d6a2e 0%, #3a8c3b 100%); color: #ffffff; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">Reset Password</a>
          </div>
          <p style="font-size: 0.82rem; color: #718096; border-top: 1px solid #e2e8f0; padding-top: 12px;">
            If you did not request this, you can safely ignore this email. Your password will remain unchanged.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return res.json({ success: true, message: 'A magic reset link has been sent to your email.' });
  } catch (err) {
    console.error('Send Reset Link Error:', err);
    return res.json({ success: false, message: 'Failed to send password reset link.' });
  }
});

// POST /api/forgot-password/reset — sets the new password using token
router.post('/api/forgot-password/reset', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.json({ success: false, message: 'Token and new password are required.' });
  }
  if (newPassword.length < 6) {
    return res.json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  try {
    const snap = await db.ref(`passwordResets/${token}`).once('value');
    if (!snap.exists()) {
      return res.json({ success: false, message: 'Invalid or expired reset link.' });
    }

    const resetData = snap.val();
    if (Date.now() > resetData.expiresAt) {
      await db.ref(`passwordResets/${token}`).remove();
      return res.json({ success: false, message: 'This password reset link has expired (10 minutes limit).' });
    }

    const userRecord = await auth.getUserByEmail(resetData.email);
    await auth.updateUser(userRecord.uid, { password: newPassword });
    await db.ref(`passwordResets/${token}`).remove();
    await logAudit(userRecord.uid, resetData.email, userRecord.displayName || resetData.email, 'PASSWORD_RESET_LINK', 'auth', 'Password reset successfully via email link');

    return res.json({ success: true, message: 'Your password has been successfully updated.' });
  } catch (err) {
    console.error('Reset Password Token Error:', err);
    return res.json({ success: false, message: 'Failed to reset password. Please try again.' });
  }
});

// API: Get current session user
router.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ authenticated: true, user: req.session.user });
  }
  res.json({ authenticated: false });
});

// ─── Helpers ───
function getRoleRedirect(role, businessAccess, selectedCategory) {
  switch (role) {
    case 'super_admin':
    case 'admin': // backward compat
      return '/admin/dashboard';
    case 'manager':
      return '/manager/dashboard';
    case 'employee':
      // Direct redirect to selected category dashboard (no business-select page)
      if (selectedCategory) return '/employee/dashboard?biz=' + selectedCategory;
      return '/business-select';
    case 'viewer': return '/admin/dashboard';
    default: return '/login';
  }
}

function redirectByRole(res, role, businessAccess) {
  res.redirect(getRoleRedirect(role, businessAccess));
}

async function logAudit(uid, email, name, action, target, details) {
  try {
    if (db) {
      await db.ref('auditLogs').push({
        userId: uid,
        userEmail: email,
        userName: name,
        action,
        target,
        details,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

module.exports = router;
