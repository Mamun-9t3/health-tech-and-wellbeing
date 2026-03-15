require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const pool = require('./db/database');
const authMiddleware = require('./middleware/auth');
const { chatWithGemini, checkSymptomWithGemini } = require('./routes/gemini');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

// ─── Helper: issue JWT cookie ──────────────────────────────────────────────────
function issueToken(res, user) {
  const token = jwt.sign(
    { id: user.id, username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// ─── Auth Routes ───────────────────────────────────────────────────────────────

// POST /api/register
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'username, email and password are required.' });

  const pwdRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!pwdRegex.test(password))
    return res.status(400).json({ error: 'Password must be 8+ chars with uppercase, number, and special character.' });

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE username=$1 OR email=$2',
      [username, email]
    );
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'Username or email already in use.' });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hash]
    );
    const user = result.rows[0];
    issueToken(res, user);
    res.status(201).json({ message: 'Account created!', user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'username, email and password are required.' });

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username=$1 AND email=$2',
      [username, email]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'No account found with those credentials.' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Incorrect password.' });

    issueToken(res, user);
    res.json({ message: 'Logged in!', user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// GET /api/me
app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, email: req.user.email });
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out.' });
});

// ─── Chat Routes ───────────────────────────────────────────────────────────────

const EMERGENCY_KEYWORDS = [
  'chest pain',
  'stroke',
  'difficulty breathing',
  'severe bleeding',
  'heart attack',
  'cant breath',
  'can not breath'
];

// POST /api/chat/save  (send message → Gemini → save both → return reply)
app.post('/api/chat/save', authMiddleware, async (req, res) => {
  const { message, history, session_id } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required.' });

  try {
    // Save user message (with session_id)
    await pool.query(
      'INSERT INTO chat_history (user_id, role, message, session_id) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'user', message, session_id || null]
    );

    const lowerMessage = message.toLowerCase();
    const isEmergency = EMERGENCY_KEYWORDS.some(kw => lowerMessage.includes(kw));

    let reply;
    let aiEmergency = false;
    if (isEmergency) {
      reply = '**[EMERGENCY] SEEK IMMEDIATE MEDICAL ATTENTION.** Call your local emergency number or proceed to the nearest hospital immediately.';
      aiEmergency = true;
    } else {
      // Get Gemini reply
      reply = await chatWithGemini(message, history || []);
      aiEmergency = reply.includes('[EMERGENCY]');
    }

    // Save assistant reply (same session)
    await pool.query(
      'INSERT INTO chat_history (user_id, role, message, session_id, is_emergency) VALUES ($1, $2, $3, $4, $5)',
      [req.user.id, 'assistant', reply, session_id || null, aiEmergency]
    );

    res.json({ reply, isEmergency: aiEmergency });
  } catch (err) {
    console.error('Chat error details:', err.message, err.stack);
    const isRateLimit = err.status === 429 || (err.message && err.message.includes('429'));
    const isOverloaded = err.status === 503 || (err.message && err.message.includes('503'));
    
    let msg = 'Failed to get AI response. Please try again.';
    if (isRateLimit) msg = 'AI rate limit reached. Please wait a moment and try again.';
    if (isOverloaded) msg = 'AI is experiencing high demand right now. Please try again later.';
    
    res.status(500).json({ error: msg });
  }
});

// GET /api/chat/sessions — list recent sessions (first user message per session)
app.get('/api/chat/sessions', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (session_id)
         session_id,
         message AS first_message,
         created_at
       FROM chat_history
       WHERE user_id = $1
         AND role = 'user'
         AND session_id IS NOT NULL
       ORDER BY session_id, created_at ASC`,
      [req.user.id]
    );
    // Sort sessions by most recent first
    const sessions = result.rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(sessions);
  } catch (err) {
    console.error('Sessions error:', err.message);
    res.status(500).json({ error: 'Failed to load sessions.' });
  }
});

// GET /api/chat/session/:id — load all messages for a session
app.get('/api/chat/session/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT role, message, created_at
       FROM chat_history
       WHERE user_id = $1 AND session_id = $2
       ORDER BY created_at ASC`,
      [req.user.id, req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Session load error:', err.message);
    res.status(500).json({ error: 'Failed to load session.' });
  }
});

// GET /api/chat/history
app.get('/api/chat/history', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT role, message, created_at FROM chat_history WHERE user_id=$1 ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Chat history error:', err.message);
    res.status(500).json({ error: 'Failed to load chat history.' });
  }
});

// ─── Wellness Routes ───────────────────────────────────────────────────────────

// GET /api/dashboard
app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT wellness, hydration, active_mins, focus_mins FROM dashboard_state WHERE user_id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      res.json({ wellness: 0, hydration: 0, activeMins: 0, focusMins: 0 });
    } else {
      const dbState = result.rows[0];
      res.json({
        wellness: dbState.wellness,
        hydration: dbState.hydration,
        activeMins: dbState.active_mins,
        focusMins: dbState.focus_mins
      });
    }
  } catch (err) {
    console.error('Get dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load dashboard state.' });
  }
});

// POST /api/dashboard
app.post('/api/dashboard', authMiddleware, async (req, res) => {
  const { wellness, hydration, activeMins, focusMins } = req.body;
  try {
    await pool.query(
      `INSERT INTO dashboard_state (user_id, wellness, hydration, active_mins, focus_mins, updated_at) 
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) DO UPDATE SET 
         wellness = EXCLUDED.wellness,
         hydration = EXCLUDED.hydration,
         active_mins = EXCLUDED.active_mins,
         focus_mins = EXCLUDED.focus_mins,
         updated_at = NOW()`,
      [req.user.id, wellness || 0, hydration || 0, activeMins || 0, focusMins || 0]
    );
    res.json({ message: 'Dashboard state saved.' });
  } catch (err) {
    console.error('Save dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to save dashboard state.' });
  }
});

// POST /api/wellness/log
app.post('/api/wellness/log', authMiddleware, async (req, res) => {
  const { duration_seconds, completed } = req.body;
  if (duration_seconds === undefined)
    return res.status(400).json({ error: 'duration_seconds is required.' });

  try {
    await pool.query(
      'INSERT INTO wellness_logs (user_id, duration_seconds, completed) VALUES ($1, $2, $3)',
      [req.user.id, duration_seconds, completed !== false]
    );
    res.status(201).json({ message: 'Wellness session logged.' });
  } catch (err) {
    console.error('Wellness log error:', err.message);
    res.status(500).json({ error: 'Failed to log wellness session.' });
  }
});

// GET /api/wellness/history
app.get('/api/wellness/history', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT duration_seconds, completed, created_at FROM wellness_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Wellness history error:', err.message);
    res.status(500).json({ error: 'Failed to load wellness history.' });
  }
});

// ─── Symptom Routes ────────────────────────────────────────────────────────────

// POST /api/symptoms/check  (send to Gemini → save → return recommendation)
app.post('/api/symptoms/check', authMiddleware, async (req, res) => {
  const { symptom } = req.body;
  if (!symptom) return res.status(400).json({ error: 'symptom is required.' });

  try {
    const recommendation = await checkSymptomWithGemini(symptom);

    await pool.query(
      'INSERT INTO symptom_logs (user_id, symptom_input, recommendation) VALUES ($1, $2, $3)',
      [req.user.id, symptom, recommendation]
    );

    res.json({ recommendation });
  } catch (err) {
    console.error('Symptom check error:', err.status || '', err.message);
    const isRateLimit = err.status === 429 || (err.message && err.message.includes('429'));
    const isOverloaded = err.status === 503 || (err.message && err.message.includes('503'));
    
    let msg = 'Failed to check symptoms. Please try again.';
    if (isRateLimit) msg = 'AI rate limit reached. Please wait a moment and try again.';
    if (isOverloaded) msg = 'AI is experiencing high demand right now. Please try again later.';
    
    res.status(500).json({ error: msg });
  }
});

// GET /api/symptoms/history
app.get('/api/symptoms/history', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT symptom_input, recommendation, created_at FROM symptom_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Symptom history error:', err.message);
    res.status(500).json({ error: 'Failed to load symptom history.' });
  }
});

// ─── Hospital Search Proxy (Overpass / OpenStreetMap) ─────────────────────────
const hospitalCache = new Map();

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function fetchWithFallback(query) {
  for (const url of OVERPASS_MIRRORS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22000);
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'HealthCompanion/1.0' },
        body:    'data=' + encodeURIComponent(query),
        signal:  controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status === 504 || res.status === 502) {
        console.warn(`Overpass mirror ${url} returned ${res.status}, trying next...`);
        continue;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.warn(`Overpass mirror failed: ${e.message}`);
      if (url === OVERPASS_MIRRORS[OVERPASS_MIRRORS.length - 1]) throw e;
    }
  }
  throw new Error('All Overpass mirrors failed');
}

// GET /api/hospitals?lat=&lon=   — returns ALL nearby healthcare, client filters by specialty
app.get('/api/hospitals', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon are required.' });

  const cacheKey = `${parseFloat(lat).toFixed(2)},${parseFloat(lon).toFixed(2)}`;
  const cached = hospitalCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 120_000) { // 2 min cache
    return res.json(cached.data);
  }

  // Fetch ALL healthcare facilities within 10 km — client side will filter by specialty
  const radius = 10000;
  const query = `[out:json][timeout:25];
(
  node["amenity"~"hospital|clinic|doctors"](around:${radius},${lat},${lon});
  way["amenity"~"hospital|clinic|doctors"](around:${radius},${lat},${lon});
);out center;`;

  try {
    const data = await fetchWithFallback(query);

    const seen = new Set();
    const places = (data.elements || [])
      .filter(el => el.tags?.name) // only named places
      .map(el => {
        const pLat = el.lat ?? el.center?.lat;
        const pLon = el.lon ?? el.center?.lon;
        const name = el.tags.name;
        const address = [
          el.tags['addr:road'] || el.tags['addr:street'],
          el.tags['addr:housenumber'],
          el.tags['addr:suburb'] || el.tags['addr:city'],
        ].filter(Boolean).join(', ') || el.tags['addr:full'] || '';
        // specialtyTags: combine OSM healthcare:speciality tag + lowercased name for client-side filtering
        const specialtyTags = ((el.tags['healthcare:speciality'] || '') + ' ' + name).toLowerCase();
        const dist = geoDistKm(parseFloat(lat), parseFloat(lon), pLat, pLon);
        return { id: el.id, name, address, type: el.tags.amenity, specialtyTags, lat: pLat, lon: pLon, dist };
      })
      .filter(p => {
        if (!p.lat || !p.lon) return false;
        const k = p.name + '|' + p.lat.toFixed(4);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 40); // return up to 40 for client to filter

    hospitalCache.set(cacheKey, { ts: Date.now(), data: places });
    res.json(places);
  } catch (err) {
    console.error('Hospital proxy error:', err.message);
    res.status(503).json({ error: 'Hospital data temporarily unavailable. Please try again in a moment.' });
  }
});

function geoDistKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = ((lat2-lat1)*Math.PI)/180, dLon = ((lon2-lon1)*Math.PI)/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── Static page fallback ──────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── Clean URL page routes (no .html needed) ──────────────────────────────────
const pages = ['wellness', 'symptoms', 'clinics', 'chatbot', 'login', 'register'];
pages.forEach(page => {
  app.get(`/${page}`, (req, res) =>
    res.sendFile(path.join(__dirname, `${page}.html`))
  );
});

// ─── Start ─────────────────────────────────────────────────────────────────────
function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`✅ Server running at http://localhost:${server.address().port}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
}

// Only start the server if not imported as a module (e.g. by Vercel)
if (require.main === module) {
  startServer(PORT);
}

// Export for Vercel serverless
module.exports = app;