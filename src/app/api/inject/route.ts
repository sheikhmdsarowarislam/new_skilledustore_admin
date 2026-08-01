import { NextRequest, NextResponse } from 'next/server';

const EXTERNAL_PROXY_URL = "https://new-skilledustore-admin.vercel.app/api/proxy";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing ID' }, { status: 400 });
    }

    const tokenRes = await fetch(`${EXTERNAL_PROXY_URL}?action=gentoken&id=${id}`, {
      cache: 'no-store',
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.success || !tokenData.token) {
      return NextResponse.json({ success: false, error: 'Token generation failed' }, { status: 400 });
    }

    const sessionRes = await fetch(`${EXTERNAL_PROXY_URL}?t=${tokenData.token}`, {
      cache: 'no-store',
    });
    const sessionData = await sessionRes.json();

    if (!sessionData.success) {
      return NextResponse.json({ success: false, error: sessionData.error || 'Session failed' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      url: sessionData.url,
      cookies: sessionData.cookies,
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}