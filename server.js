require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => callback(null, file.mimetype.startsWith('video/'))
});

const fallbackReviews = [
  { author: 'Neha Verma', rating: 5, text: 'Quick, professional repair. Our washing machine was working perfectly the same day.', relativeTimeDescription: '2 weeks ago' },
  { author: 'Rakesh Kumar', rating: 5, text: 'Clear pricing and excellent refrigerator service. Highly recommended.', relativeTimeDescription: '1 month ago' },
  { author: 'Priya Shah', rating: 5, text: 'The RO technician explained everything and left the area spotless.', relativeTimeDescription: '1 month ago' }
];

let db;
const adminSessionTtlMs = 12 * 60 * 60 * 1000;
const defaultVisitCharge = 250;

function collection(name) {
  if (!db) throw new Error('Database is not connected. Set MONGODB_URI and restart the app.');
  return db.collection(name);
}

function id(value) {
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function serialize(document) {
  if (!document) return document;
  const { _id, ...rest } = document;
  return { id: _id?.toString(), ...rest };
}

function secretsMatch(value, expected) {
  if (!value || !expected) return false;
  const actualBuffer = Buffer.from(String(value));
  const expectedBuffer = Buffer.from(String(expected));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function adminSecret() {
  return process.env.ADMIN_TOKEN || process.env.ADMIN_PASSWORD || '';
}

function createAdminSession(username) {
  const payload = Buffer.from(JSON.stringify({
    username,
    expiresAt: Date.now() + adminSessionTtlMs
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', adminSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function isValidAdminSession(token) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature || !adminSecret()) return false;
  const expectedSignature = crypto.createHmac('sha256', adminSecret()).update(payload).digest('base64url');
  if (!secretsMatch(signature, expectedSignature)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session.expiresAt > Date.now();
  } catch (_error) {
    return false;
  }
}

function requireAdmin(request, response, next) {
  const providedToken = request.header('x-admin-token') || request.header('authorization')?.replace(/^Bearer\s+/i, '');
  const legacyToken = process.env.ADMIN_TOKEN;
  if ((!legacyToken || !secretsMatch(providedToken, legacyToken)) && !isValidAdminSession(providedToken)) {
    return response.status(401).json({ error: 'Admin access is required.' });
  }
  return next();
}

function clean(value, max = 240) {
  return String(value || '').trim().slice(0, max);
}

async function createLead(request, response) {
  try {
    const lead = {
      name: clean(request.body.name, 100),
      phone: clean(request.body.phone, 30),
      appliance: clean(request.body.appliance, 80),
      brand: clean(request.body.brand, 80),
      problem: clean(request.body.problem, 240),
      area: clean(request.body.area, 160),
      source: ['chatbot', 'quick-booking', 'website'].includes(request.body.source) ? request.body.source : 'website',
      status: 'New Lead',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (!lead.phone || !lead.appliance || !lead.area) {
      return response.status(422).json({ error: 'Phone, appliance, and area are required.' });
    }

    const result = await collection('leads').insertOne(lead);
    return response.status(201).json({ lead: serialize({ _id: result.insertedId, ...lead }) });
  } catch (error) {
    console.error('Lead creation failed:', error.message);
    return response.status(503).json({ error: 'We could not save your request right now. Please call us directly.' });
  }
}

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(publicDir));

app.post('/api/admin/login', (request, response) => {
  const username = clean(request.body.username, 80);
  const password = String(request.body.password || '');
  const expectedUsername = process.env.ADMIN_USERNAME || 'admin';
  const expectedPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_TOKEN || '';
  if (!expectedPassword) return response.status(503).json({ error: 'Admin login is not configured on the server.' });
  if (!secretsMatch(username, expectedUsername) || !secretsMatch(password, expectedPassword)) {
    return response.status(401).json({ error: 'Invalid admin username or password.' });
  }
  return response.json({ token: createAdminSession(username), expiresIn: adminSessionTtlMs });
});

app.post('/api/leads', createLead);

app.post('/api/chat/conversations', async (request, response) => {
  try {
    const sessionId = clean(request.body.sessionId, 100);
    const messages = Array.isArray(request.body.messages) ? request.body.messages.slice(-80).map((message) => ({
      sender: message.sender === 'user' ? 'user' : 'assistant',
      text: clean(message.text, 800),
      at: message.at || new Date().toISOString()
    })) : [];
    if (!sessionId || !messages.length) return response.status(422).json({ error: 'A session and messages are required.' });

    await collection('conversations').updateOne(
      { sessionId },
      { $set: { messages, updatedAt: new Date() }, $setOnInsert: { sessionId, createdAt: new Date() } },
      { upsert: true }
    );
    return response.status(204).end();
  } catch (error) {
    console.error('Conversation save failed:', error.message);
    return response.status(503).json({ error: 'Conversation could not be saved.' });
  }
});

app.get('/api/reviews', async (_request, response) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!apiKey || !placeId || typeof fetch !== 'function') {
    return response.json({ source: 'sample', averageRating: 4.9, totalReviews: 247, reviews: fallbackReviews });
  }

  try {
    const result = await fetch(`https://places.googleapis.com/v1/places/${placeId}?fields=rating,userRatingCount,reviews&key=${apiKey}`);
    if (!result.ok) throw new Error(`Google Places returned ${result.status}`);
    const place = await result.json();
    const reviews = (place.reviews || []).map((review) => ({
      author: review.authorAttribution?.displayName || 'Google customer',
      rating: review.rating || 5,
      text: review.text?.text || 'Great service.',
      relativeTimeDescription: review.relativePublishTimeDescription || 'Recently'
    }));
    return response.json({ source: 'google', averageRating: place.rating || 0, totalReviews: place.userRatingCount || 0, reviews });
  } catch (error) {
    console.error('Google reviews request failed:', error.message);
    return response.json({ source: 'sample', averageRating: 4.9, totalReviews: 247, reviews: fallbackReviews });
  }
});

app.get('/api/ratings', async (_request, response) => {
  try {
    const [ratings, summary] = await Promise.all([
      collection('ratings').find({}).sort({ createdAt: -1 }).limit(30).toArray(),
      collection('ratings').aggregate([{ $group: { _id: null, averageRating: { $avg: '$rating' }, totalRatings: { $sum: 1 } } }]).next()
    ]);
    return response.json({
      averageRating: Number(summary?.averageRating || 0),
      totalRatings: summary?.totalRatings || 0,
      ratings: ratings.map(serialize)
    });
  } catch (error) {
    console.error('Customer ratings request failed:', error.message);
    return response.status(503).json({ error: 'Customer ratings are unavailable right now.' });
  }
});

app.post('/api/ratings', async (request, response) => {
  const ratingValue = Number(request.body.rating);
  const rating = {
    name: clean(request.body.name, 100),
    rating: Number.isInteger(ratingValue) ? ratingValue : 0,
    text: clean(request.body.comment, 500),
    createdAt: new Date(),
    source: 'website'
  };
  if (!rating.name || rating.rating < 1 || rating.rating > 5) {
    return response.status(422).json({ error: 'Name and a rating from 1 to 5 are required.' });
  }
  try {
    const result = await collection('ratings').insertOne(rating);
    return response.status(201).json({ rating: serialize({ _id: result.insertedId, ...rating }) });
  } catch (error) {
    console.error('Customer rating save failed:', error.message);
    return response.status(503).json({ error: 'Your rating could not be saved right now.' });
  }
});

app.get('/api/videos', async (_request, response) => {
  const defaults = [
    { id: 'care-tips', title: 'How to keep a front-load washer fresh', type: 'youtube', url: 'https://www.youtube.com/embed/THgLUP3EGEw' },
    { id: 'ro-care', title: 'Simple RO water purifier care tips', type: 'youtube', url: 'https://www.youtube.com/embed/7kc9u_NpKaw' }
  ];
  try {
    const uploaded = await collection('videos').find({}).sort({ createdAt: -1 }).limit(8).toArray();
    return response.json([...uploaded.map(serialize), ...defaults]);
  } catch (_error) {
    return response.json(defaults);
  }
});

app.get('/api/notifications/latest', async (request, response) => {
  try {
    const after = new Date(clean(request.query.after));
    const query = Number.isNaN(after.getTime()) ? {} : { createdAt: { $gt: after } };
    const notification = await collection('notifications').find(query).sort({ createdAt: -1 }).limit(1).next();
    return response.json({ notification: serialize(notification) || null });
  } catch (_error) {
    return response.json({ notification: null });
  }
});

app.get('/api/admin/dashboard', requireAdmin, async (_request, response) => {
  try {
    const monthStart = new Date();
    monthStart.setHours(0, 0, 0, 0);
    monthStart.setDate(1);
    const [leads, conversations, notifications, videos, totalOrders, monthlyOrders, statusSummary, areaSummary, ratingSummary, ratings] = await Promise.all([
      collection('leads').find({}).sort({ createdAt: -1 }).limit(100).toArray(),
      collection('conversations').countDocuments(),
      collection('notifications').find({}).sort({ createdAt: -1 }).limit(10).toArray(),
      collection('videos').find({}).sort({ createdAt: -1 }).limit(20).toArray(),
      collection('leads').countDocuments(),
      collection('leads').countDocuments({ createdAt: { $gte: monthStart } }),
      collection('leads').aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      collection('leads').aggregate([
        { $match: { area: { $exists: true, $ne: '' } } },
        { $group: { _id: '$area', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } }
      ]).toArray(),
      collection('ratings').aggregate([{ $group: { _id: null, averageRating: { $avg: '$rating' }, totalRatings: { $sum: 1 } } }]).next(),
      collection('ratings').find({}).sort({ createdAt: -1 }).limit(20).toArray()
    ]);
    const counts = statusSummary.reduce((current, item) => ({ ...current, [item._id]: item.count }), {});
    const configuredVisitCharge = Number(process.env.VISIT_CHARGE);
    const visitCharge = Number.isFinite(configuredVisitCharge) && configuredVisitCharge >= 0 ? configuredVisitCharge : defaultVisitCharge;
    return response.json({
      leads: leads.map(serialize),
      conversations,
      notifications: notifications.map(serialize),
      videos: videos.map(serialize),
      ratings: ratings.map(serialize),
      counts,
      areaBreakdown: areaSummary.map((item) => ({ area: item._id, orders: item.count })),
      metrics: {
        totalOrders,
        monthlyOrders,
        visitCharge,
        monthlyIncome: monthlyOrders * visitCharge,
        averageRating: Number(ratingSummary?.averageRating || 0),
        totalRatings: ratingSummary?.totalRatings || 0
      }
    });
  } catch (error) {
    console.error('Dashboard request failed:', error.message);
    return response.status(503).json({ error: 'Dashboard data is unavailable. Check MongoDB connection.' });
  }
});

app.patch('/api/admin/leads/:leadId', requireAdmin, async (request, response) => {
  const leadId = id(request.params.leadId);
  const statuses = ['New Lead', 'Contacted', 'In Progress', 'Completed'];
  if (!leadId || !statuses.includes(request.body.status)) return response.status(422).json({ error: 'Valid lead and status are required.' });
  try {
    const result = await collection('leads').findOneAndUpdate({ _id: leadId }, { $set: { status: request.body.status, updatedAt: new Date() } }, { returnDocument: 'after' });
    if (!result) return response.status(404).json({ error: 'Lead not found.' });
    return response.json({ lead: serialize(result) });
  } catch (error) {
    return response.status(503).json({ error: 'Lead status could not be updated.' });
  }
});

app.post('/api/admin/notifications', requireAdmin, async (request, response) => {
  const notification = { title: clean(request.body.title, 80), body: clean(request.body.body, 240), createdAt: new Date() };
  if (!notification.title || !notification.body) return response.status(422).json({ error: 'A title and message are required.' });
  try {
    const result = await collection('notifications').insertOne(notification);
    return response.status(201).json({ notification: serialize({ _id: result.insertedId, ...notification }) });
  } catch (error) {
    return response.status(503).json({ error: 'Notification could not be sent.' });
  }
});

app.post('/api/admin/videos', requireAdmin, upload.single('video'), async (request, response) => {
  const type = clean(request.body.type, 20);
  const title = clean(request.body.title, 120);
  const youtubeUrl = clean(request.body.youtubeUrl, 500);
  if (!title || !['youtube', 'mp4'].includes(type) || (type === 'youtube' && !youtubeUrl) || (type === 'mp4' && !request.file)) {
    return response.status(422).json({ error: 'Add a title and either a YouTube URL or an MP4 file.' });
  }
  const video = { title, type, url: type === 'mp4' ? `/uploads/${request.file.filename}` : youtubeUrl, createdAt: new Date() };
  try {
    const result = await collection('videos').insertOne(video);
    return response.status(201).json({ video: serialize({ _id: result.insertedId, ...video }) });
  } catch (error) {
    return response.status(503).json({ error: 'Video could not be saved.' });
  }
});

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI is not set. Lead and chat persistence will be unavailable.');
    return;
  }

  try {
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db(process.env.MONGODB_DB || 'mahadev_smart_services');
    await Promise.all([
      collection('leads').createIndex({ createdAt: -1 }),
      collection('conversations').createIndex({ sessionId: 1 }, { unique: true }),
      collection('notifications').createIndex({ createdAt: -1 }),
      collection('ratings').createIndex({ createdAt: -1 })
    ]);
    console.log('MongoDB connected.');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
  }
}

function start() {
  app.listen(port, () => console.log(`Mahadev Smart Assistant running on http://localhost:${port}`));
  connectDatabase();
}

start();
