import express from 'express';
import bcrypt from 'bcrypt';
import { userDb, db } from '../database/db.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value) {
  return EMAIL_PATTERN.test(value);
}

function getInviteCode() {
  return process.env.REGISTRATION_INVITE_CODE || process.env.INVITE_CODE || '';
}

function serializeUser(user) {
  return {
    id: user.id,
    publicId: user.publicId,
    username: user.username,
    email: user.email || null
  };
}

// Check auth status and setup requirements
router.get('/status', async (req, res) => {
  try {
    const hasUsers = await userDb.hasUsers();
    res.json({ 
      needsSetup: !hasUsers,
      isAuthenticated: false // Will be overridden by frontend if token exists
    });
  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User registration (setup) - only allowed if no users exist
router.post('/register', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email ?? req.body.username);
    const { password, inviteCode } = req.body;
    const configuredInviteCode = getInviteCode();
    
    // Validate input
    if (!email || !password || !inviteCode) {
      return res.status(400).json({ error: 'Email, password, and invite code are required' });
    }
    
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (!configuredInviteCode) {
      return res.status(503).json({ error: 'Registration invite code is not configured' });
    }

    if (inviteCode !== configuredInviteCode) {
      return res.status(403).json({ error: 'Invalid invite code' });
    }
    
    // Use a transaction to prevent race conditions
    db.prepare('BEGIN').run();
    try {
      const existingUser = userDb.getUserByEmail(email);
      if (existingUser) {
        db.prepare('ROLLBACK').run();
        return res.status(409).json({ error: 'Email already exists' });
      }
      
      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      // Create user
      const user = userDb.createUser(email, passwordHash, email);
      
      // Generate token
      const token = generateToken(user);
      
      db.prepare('COMMIT').run();

      // Update last login (non-fatal, outside transaction)
      userDb.updateLastLogin(user.id);

      res.json({
        success: true,
        user: serializeUser(user),
        token
      });
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
    
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// User login
router.post('/login', async (req, res) => {
  try {
    const loginIdentifier = normalizeEmail(req.body.email ?? req.body.username);
    const { password } = req.body;
    
    // Validate input
    if (!loginIdentifier || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Get user from database
    const user = isValidEmail(loginIdentifier)
      ? userDb.getUserByEmail(loginIdentifier)
      : userDb.getUserByUsername(loginIdentifier);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Generate token
    const token = generateToken(user);
    
    // Update last login
    userDb.updateLastLogin(user.id);
    
    res.json({
      success: true,
      user: serializeUser(user),
      token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user (protected route)
router.get('/user', authenticateToken, (req, res) => {
  res.json({
    user: req.user
  });
});

// Logout (client-side token removal, but this endpoint can be used for logging)
router.post('/logout', authenticateToken, (req, res) => {
  // In a simple JWT system, logout is mainly client-side
  // This endpoint exists for consistency and potential future logging
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
