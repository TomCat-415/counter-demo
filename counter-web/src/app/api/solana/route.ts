export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const upstream = (process.env.RPC_UPSTREAM || 'https://api.devnet.solana.com').replace(/\/$/, '');
const heliusKey = process.env.HELIUS_API_KEY;
const target = heliusKey ? `${upstream}/?api-key=${heliusKey}` : upstream;

export async function POST(request: Request) {
  const maxRetries = 2;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const body = await request.text();
      const resp = await fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      // If we get a 503, retry after a short delay
      if (resp.status === 503 && attempt < maxRetries) {
        console.warn(`RPC returned 503, retrying in ${(attempt + 1) * 500}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 500));
        continue;
      }

      const contentType = resp.headers.get('content-type') || 'application/json';
      return new Response(resp.body, { status: resp.status, headers: { 'content-type': contentType } });
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        console.warn(`RPC request failed, retrying in ${(attempt + 1) * 500}ms (attempt ${attempt + 1}/${maxRetries + 1}):`, err);
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 500));
        continue;
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  return new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: `RPC failed after ${maxRetries + 1} attempts: ${message}` } }), {
    status: 502,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET() {
  return new Response('Method Not Allowed', { status: 405 });
}


