/**
 * AGENT OS — api/app.js
 * Single Vercel serverless function: a safe CORS pass-through proxy.
 *
 * The dashboard talks to AI providers directly from the browser (all major
 * free providers allow CORS). If a provider ever blocks browser calls, the
 * frontend can route through POST /api/app instead:
 *
 *   { "url": "https://api.provider.com/v1/...", "method": "POST",
 *     "headers": { "Authorization": "Bearer ..." }, "body": { ... } }
 *
 * Only whitelisted AI domains are allowed, so this can't be abused as an
 * open proxy. No keys are stored server-side — the user's key rides along
 * in the request and is forwarded untouched.
 */

const ALLOWED_HOSTS = [
  'api.groq.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'api.mistral.ai',
  'api.cerebras.ai',
  'models.github.ai',
  'api.elevenlabs.io',
  'text.pollinations.ai',
  'image.pollinations.ai',
  'gen.pollinations.ai'
];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { url, method = 'POST', headers = {}, body } = req.body || {};
    if (!url) return res.status(400).json({ error: 'Missing url' });

    let host;
    try { host = new URL(url).hostname; }
    catch { return res.status(400).json({ error: 'Invalid url' }); }

    if (!ALLOWED_HOSTS.includes(host)) {
      return res.status(403).json({ error: 'Host not allowed: ' + host });
    }

    // Forward only safe headers
    const fwd = { 'Content-Type': headers['Content-Type'] || 'application/json' };
    for (const h of ['Authorization', 'xi-api-key', 'HTTP-Referer', 'X-Title']) {
      if (headers[h]) fwd[h] = headers[h];
    }

    const upstream = await fetch(url, {
      method,
      headers: fwd,
      body: method === 'GET' ? undefined : JSON.stringify(body)
    });

    const contentType = upstream.headers.get('content-type') || '';
    res.status(upstream.status);
    res.setHeader('Content-Type', contentType);

    if (contentType.includes('application/json')) {
      return res.json(await upstream.json());
    }
    if (contentType.startsWith('text/')) {
      return res.send(await upstream.text());
    }
    // binary (audio, images)
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Proxy error' });
  }
};
