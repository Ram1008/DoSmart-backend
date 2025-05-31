import db from '../db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { body, validationResult } from 'express-validator';

dotenv.config();

const SALT_ROUNDS = 10;

// Registration Handler
export const register = [
  body('username').isLength({ min: 3 }).withMessage('Username must have 3+ chars'),
  body('password').isLength({ min: 6 }).withMessage('Password must have 6+ chars'),

  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { username, password } = req.body;
    try {
      const userExists = await db.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );
      if (userExists.rows.length > 0)
        return res.status(409).json({ error: 'Username already taken' });

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      const result = await db.query(
        'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username, created_at',
        [username, hashedPassword]
      );

      const newUser = result.rows[0];
      const payload = { id: newUser.id, username: newUser.username };
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.status(201).json({ message: 'User registered', user: newUser, token:token });
    } catch (err) {
      next(err);
    }
  },
];

// Login Handler
export const login = [
  body('username').notEmpty().withMessage('Username required'),
  body('password').notEmpty().withMessage('Password required'),

  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { username, password } = req.body;
    try {
      const result = await db.query(
        'SELECT id, username, password FROM users WHERE username = $1',
        [username]
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: 'User not found' });

      const user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return res.status(401).json({ error: 'Invalid credentials' });

      const payload = { id: user.id, username: user.username };
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

      res.json({ message: 'Login successful', token });
    } catch (err) {
      next(err);
    }
  },
];
