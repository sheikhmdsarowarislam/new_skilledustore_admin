import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const ALLOWED_DOMAINS = [
  'skilledustore.com',
  'www.skilledustore.com',
  'dashboard.skilledustore.com',
  'localhost:3000',
  'new-skilledustore-admin.vercel.app', // 👈 আপনার নতুন ডোমেইনটি এখানে বসান
  'admin-panel-plum-eight.vercel.app',
];

const usedTokensSet = new Set<string>();

function isAllowedDomain(req: NextRequest) {
  const origin = req.headers.get('origin') || '';
  const referer = req.headers.get('referer') || '';
  const userAgent = req.headers.get('user-agent') || '';

  const blockedAgents = ['curl', 'wget', 'python', 'scrapy', 'bot'];
  for (const blocked of blockedAgents) {
    if (userAgent.toLowerCase().includes(blocked)) return false;
  }

  if (!origin && !referer) return true;

  let hostName = '';
  try {
    const url = new URL(origin || referer);
    hostName = url.hostname;
  } catch (e) {
    return true;
  }

  return ALLOWED_DOMAINS.some(allowed => 
    hostName === allowed || 
    hostName.endsWith('.' + allowed) || 
    hostName.endsWith('.vercel.app')
  );
}

function corsHeaders(req: NextRequest) {
  const origin = req.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Panel-Auth, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(req) });
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req);

  if (!isAllowedDomain(req)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403, headers });
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get('t');
  const action = searchParams.get('action');
  const id = searchParams.get('id');
  const panelAuth = req.headers.get('x-panel-auth');

  try {
    if (action === 'test') {
      return NextResponse.json({ success: true, message: 'API Connected', database: 'Connected' }, { headers });
    }

    // 🔒 ১. ওয়ান-টাইম সিকিউর্ড টোকেন রিকোয়েস্ট
    if (token) {
      if (usedTokensSet.has(token)) {
        return NextResponse.json({ success: false, error: 'Token Already Used!' }, { status: 403, headers });
      }

      try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const [targetId, timestamp, nonce] = decoded.split(':');

        if (!targetId || !timestamp || !nonce) {
          return NextResponse.json({ success: false, error: 'Invalid Token Format' }, { status: 400, headers });
        }

        const tokenTime = parseInt(timestamp, 10);
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime - tokenTime > 15) {
          return NextResponse.json({ success: false, error: 'Token Expired!' }, { status: 403, headers });
        }

        usedTokensSet.add(token);
        setTimeout(() => usedTokensSet.delete(token), 300000);

        const [rows]: any = await pool.query('SELECT * FROM cookies WHERE id = ?', [targetId]);
        if (rows.length > 0) {
          const cookie = rows[0];
          return NextResponse.json({
            success: true,
            url: cookie.target_url,
            cookies: cookie.cookies_json,
            domain: cookie.domain,
            id: cookie.id
          }, { headers });
        }

        return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404, headers });
      } catch (e) {
        return NextResponse.json({ success: false, error: 'Invalid Token Payload' }, { status: 400, headers });
      }
    }

    if (!panelAuth && (action === 'list' || action === 'get')) {
      return NextResponse.json({ success: false, error: 'Access Denied' }, { status: 403, headers });
    }

    // 🔑 ২. ডাইনামিক টোকেন জেনারেটর
    if (action === 'gentoken' && id) {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = crypto.randomBytes(6).toString('hex');
      const rawToken = `${id}:${timestamp}:${nonce}`;
      const encodedToken = Buffer.from(rawToken).toString('base64');

      return NextResponse.json({ success: true, token: encodedToken }, { headers });
    }

    // 📋 ৩. কুকি লিস্ট
    if ((action === 'list' || !action) && panelAuth === 'active') {
      const [rows]: any = await pool.query('SELECT id, domain, target_url, created_at FROM cookies ORDER BY created_at DESC');
      return NextResponse.json({ success: true, data: rows }, { headers });
    }

    // 📋 ৪. সিঙ্গেল কন্টেন্ট লোড
    if (action === 'get' && id && panelAuth === 'active') {
      const [rows]: any = await pool.query('SELECT id, domain, target_url FROM cookies WHERE id = ?', [id]);
      if (rows.length > 0) {
        const cookie = rows[0];
        return NextResponse.json({
          success: true,
          id: cookie.id,
          domain: cookie.domain,
          url: cookie.target_url,
          cookies: ""
        }, { headers });
      }
      return NextResponse.json({ success: false, error: 'Cookie not found' }, { status: 404, headers });
    }

    // 📋 ৫. HTML Code Generation
    if (action === 'gethtml') {
      if (!id) return NextResponse.json({ success: false, error: 'Missing ID' }, { status: 400, headers });

      const [rows]: any = await pool.query('SELECT * FROM cookies WHERE id = ?', [id]);
      if (rows.length === 0) return NextResponse.json({ success: false, error: 'Cookie not found' }, { status: 404, headers });

      const cookie = rows[0];

      const htmlCode = `
<div class="button-container" id="container_${cookie.id}">
  <button class="cookie-btn" onclick="triggerWebToolzAccess(${cookie.id}, this)">
    Access ${cookie.domain}
  </button>
</div>

<script>
if (typeof window.triggerWebToolzAccess === 'undefined') {
  window.triggerWebToolzAccess = async function(id, btnElement) {
    const originalText = btnElement.textContent;
    btnElement.textContent = '⏳ Loading...';
    btnElement.disabled = true;

    try {
      const tokenRes = await fetch('https://admin-panel-plum-eight.vercel.app/api/proxy?action=gentoken&id=' + id);
      const tokenData = await tokenRes.json();

      if (!tokenData.success || !tokenData.token) {
        alert('❌ Token failed');
        btnElement.textContent = originalText;
        btnElement.disabled = false;
        return;
      }

      const sessionRes = await fetch('https://admin-panel-plum-eight.vercel.app/api/proxy?t=' + tokenData.token);
      const sessionData = await sessionRes.json();

      if (sessionData.success && sessionData.cookies && sessionData.url) {
        window.postMessage({
          type: 'SETUP_SESSION',
          sessionData: {
            url: sessionData.url,
            cookies: sessionData.cookies
          }
        }, '*');
      } else {
        alert('❌ Session Expired');
      }
    } catch (err) {
      alert('❌ Connection Error');
    } finally {
      btnElement.textContent = originalText;
      btnElement.disabled = false;
    }
  };
}
</script>
`.trim();

      return NextResponse.json({ success: true, html: htmlCode }, { headers });
    }

    // 🗑️ ৬. ডিলিট
    if (action === 'delete') {
      if (!id) return NextResponse.json({ success: false, error: 'Missing ID' }, { status: 400, headers });
      await pool.query('DELETE FROM cookies WHERE id = ?', [id]);
      return NextResponse.json({ success: true, message: 'Cookie deleted successfully' }, { headers });
    }

    return NextResponse.json({ success: false, error: 'Invalid Action' }, { status: 400, headers });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Database error' }, { status: 500, headers });
  }
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);

  if (!isAllowedDomain(req)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403, headers });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    const body = await req.json();

    if (action === 'login') {
      const { username, password } = body;
      const [rows]: any = await pool.query("SELECT * FROM admin_users WHERE username = ? AND status = 'active' LIMIT 1", [username]);
      if (rows.length > 0) {
        const user = rows[0];
        const match = await bcrypt.compare(password, user.password) || password === user.password;
        if (match) {
          return NextResponse.json({ success: true, message: 'Login successful' }, { headers });
        }
      }
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401, headers });
    }

    if (action === 'add') {
      const { domain, url, cookies } = body;
      let cookiesJson = typeof cookies === 'string' ? cookies : JSON.stringify(cookies);

      const [maxRows]: any = await pool.query('SELECT MAX(id) as maxId FROM cookies');
      const nextId = (maxRows[0]?.maxId || 0) + 1;

      await pool.query(
        'INSERT INTO cookies (id, domain, target_url, cookies_json, created_at) VALUES (?, ?, ?, ?, NOW())',
        [nextId, domain, url, cookiesJson]
      );

      return NextResponse.json({ success: true, id: nextId, message: 'Cookie saved successfully' }, { status: 201, headers });
    }

    if (action === 'update') {
      const { id, domain, url, cookies } = body;
      let cookiesJson = typeof cookies === 'string' ? cookies : JSON.stringify(cookies);
      await pool.query('UPDATE cookies SET domain = ?, target_url = ?, cookies_json = ?, created_at = NOW() WHERE id = ?', [domain, url, cookiesJson, id]);

      return NextResponse.json({ success: true, message: 'Cookie updated successfully' }, { headers });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400, headers });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Database error' }, { status: 500, headers });
  }
}