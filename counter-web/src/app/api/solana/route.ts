export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const upstream = (process.env.RPC_UPSTREAM || 'https://api.devnet.solana.com').replace(/\/$/, '');
const heliusKey = process.env.HELIUS_API_KEY;
const target = heliusKey ? `${upstream}/?api-key=${heliusKey}` : upstream;

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const resp = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
    });
    const contentType = resp.headers.get('content-type') || 'application/json';
    return new Response(resp.body, { status: resp.status, headers: { 'content-type': contentType } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message } }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405 });
}


