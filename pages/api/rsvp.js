import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitStore = new Map();
let dbInstance;
let migrationsApplied = false;

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function checkRateLimit(identifier) {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier) || { windowStart: now, count: 0 };

  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.windowStart = now;
    entry.count = 1;
  } else {
    entry.count += 1;
  }

  rateLimitStore.set(identifier, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

function ensureDatabase() {
  if (dbInstance) return dbInstance;

  const dataDir = path.join(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'rsvps.db');
  const migrationsDir = path.join(dataDir, 'migrations');

  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(migrationsDir)) {
    throw new Error('Migrations directory missing.');
  }

  dbInstance = new Database(dbPath);

  if (!migrationsApplied) {
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      dbInstance.exec(sql);
    }

    migrationsApplied = true;
  }

  return dbInstance;
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') {
    return 'Invalid payload';
  }

  const errors = [];
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const attending = typeof body.attending === 'string' ? body.attending.trim() : '';
  const numGuests = Number.isInteger(body.numGuests) ? body.numGuests : Number(body.numGuests);
  const mealPreference = typeof body.mealPreference === 'string' && body.mealPreference.trim().length > 0 ? body.mealPreference.trim() : null;
  const message = typeof body.message === 'string' && body.message.trim().length > 0 ? body.message.trim() : null;

  if (!fullName) {
    errors.push('Full name is required');
  } else if (fullName.length > 200) {
    errors.push('Full name is too long');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    errors.push('Valid email is required');
  }

  if (!['Yes', 'No'].includes(attending)) {
    errors.push('Attending must be Yes or No');
  }

  if (!Number.isInteger(numGuests) || numGuests < 0 || numGuests > 10) {
    errors.push('Number of guests must be between 0 and 10');
  }

  if (mealPreference && mealPreference.length > 200) {
    errors.push('Meal preference is too long');
  }

  if (message && message.length > 1000) {
    errors.push('Message is too long');
  }

  if (errors.length > 0) {
    return errors.join('; ');
  }

  return {
    fullName,
    email,
    attending,
    numGuests,
    mealPreference,
    message
  };
}

export default function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const clientIdentifier =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'anonymous';

  if (!checkRateLimit(clientIdentifier)) {
    return res.status(429).json({ ok: false, message: 'Too many requests. Please try again in a moment.' });
  }

  const validationResult = validatePayload(req.body);

  if (typeof validationResult === 'string') {
    return res.status(400).json({ ok: false, message: validationResult });
  }

  try {
    const db = ensureDatabase();
    const insert = db.prepare(
      `INSERT INTO rsvps (full_name, email, attending, num_guests, meal_preference, message)
       VALUES (@fullName, @email, @attending, @numGuests, @mealPreference, @message)`
    );
    insert.run(validationResult);

    return res.status(201).json({ ok: true, message: 'RSVP recorded' });
  } catch (error) {
    console.error('RSVP insert failed', error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}
