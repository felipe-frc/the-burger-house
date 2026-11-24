// Real built frontend + real isolated ASP.NET API. No production proxy fallback.
import { createServer } from 'node:https';
import { readFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, extname, basename, isAbsolute } from 'node:path';
import { Readable } from 'node:stream';
import { resolveStaticFile } from './homologation-static.mjs';
import { portfolioCheckoutAllowed } from './portfolio-checkout-policy.mjs';
const root = process.env.HOMOLOGATION_ROOT ??
  (await readFile(new URL('../test-results/acceptance/homologation-path.txt', import.meta.url), 'utf8')).trim();
if (!isAbsolute(root) || !basename(root).startsWith('burgerhouse-homologation-')) throw new Error('Explicit isolated environment required.');
const apiPort = process.env.HOMOLOGATION_API_PORT || '5449';
if (!/^\d{1,5}$/.test(apiPort) || +apiPort < 1024 || +apiPort > 65535) throw new Error('Invalid local API port.');
const api = 'http://127.0.0.1:' + apiPort;
const expectedDatabase = process.env.HOMOLOGATION_EXPECTED_DATABASE || 'burgerhouse.homologation.db';
if (!['burgerhouse.homologation.db', 'tbh_portfolio_dev'].includes(expectedDatabase)) throw new Error('Unexpected local database.');
const canonicalRoot = process.platform === 'win32' ? resolve(root).toLowerCase() : resolve(root);
const environmentId = createHash('sha256').update(canonicalRoot).digest('hex');
async function confirmIsolation() {
  const probe = await fetch(`${api}/api/homologation/info`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  const isolation = probe.ok ? await probe.json() : null;
  if (isolation?.environment !== 'Homologation' || isolation.isolated !== true || isolation.sandbox !== true ||
      isolation.database !== expectedDatabase || isolation.environmentId !== environmentId ||
      isolation.provider !== (expectedDatabase === 'tbh_portfolio_dev' ? 'PostgreSQL' : 'SQLite'))
    throw new Error('Start the isolated Homologation API before opening the gateway.');
  return isolation;
}
const isolation = await confirmIsolation();
const staticRoot = resolve(import.meta.dirname, '..', process.env.BURGER_BUILD_OUTPUT_DIR || '.vercel/output', 'static');
const config = JSON.parse(await readFile(resolve(staticRoot, '../config.json'), 'utf8'));
const types = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html; charset=utf-8', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.webm':'video/webm' };
const publicReady = process.env.HOMOLOGATION_PUBLIC_READY === '1';
const canCheckout = current => expectedDatabase === 'tbh_portfolio_dev'
  ? portfolioCheckoutAllowed(process.env, current)
  : process.env.HOMOLOGATION_DISABLE_CHECKOUT !== '1' && (current.localCheckout === true || publicReady);
const checkoutEnabled = canCheckout(isolation);
const server = createServer({ key: await readFile(process.env.HOMOLOGATION_TLS_KEY || resolve(root, 'localhost.key')), cert: await readFile(process.env.HOMOLOGATION_TLS_CERT || resolve(root, 'localhost.crt')) }, async (req, res) => {
  try {
    const url = new URL(req.url, 'https://localhost:4174');
    if (url.pathname === '/homologation-info') {
      const current = await confirmIsolation();
      res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ environment:'Homologation', isolated:true, sandbox:true, checkoutEnabled:checkoutEnabled && canCheckout(current) })); return;
    }
    for (const rule of config.routes ?? []) if (rule.headers && new RegExp(`^${rule.src}$`).test(url.pathname)) for (const [key,value] of Object.entries(rule.headers)) res.setHeader(key,value);
    if (/^\/api\//i.test(url.pathname)) {
      // Revalidate every API request, not only checkout: a replaced listener may use another database.
      const current = await confirmIsolation();
      if (/^\/api\/checkout(?:\/|$)/i.test(url.pathname)) {
        if (!checkoutEnabled || !canCheckout(current)) {
          res.writeHead(503,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'Checkout sandbox desativado. Inicie o launcher oficial com sua credencial privada, sem -Offline.'})); return;
        }
      }
      const chunks=[]; let length=0;
      for await (const chunk of req) { length+=chunk.length; if(length>6*1024*1024)throw new Error('Body too large.'); chunks.push(chunk); }
      const headers = new Headers(req.headers);
      for(const key of ['host','connection','transfer-encoding','content-length','x-forwarded-for','x-forwarded-host','x-forwarded-proto','forwarded'])headers.delete(key);
      headers.set('x-forwarded-proto','https');
      const response=await fetch(api+url.pathname+url.search,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),redirect:'manual',signal:AbortSignal.timeout(30000)});
      if(process.env.HOMOLOGATION_WEBHOOK_RECEIPTS==='1'&&req.method==='POST'&&url.pathname==='/api/webhooks/pagbank'){
        const raw=Buffer.concat(chunks);let event={};try{const parsed=JSON.parse(raw.toString('utf8'));if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))event=parsed;}catch{}
        const reference=/^payment:\d+$/.test(event.reference_id??'')?event.reference_id:null;
        const chargeIds=Array.isArray(event.charges)?event.charges.map(c=>c?.id).filter(id=>/^CHAR_[a-z0-9-]+$/i.test(id??'')):[];
        const receipt={at:new Date().toISOString(),reference,chargeIds,financialChargeCount:Array.isArray(event.charges)?event.charges.length:0,payloadSha256:createHash('sha256').update(raw).digest('hex'),signatureHeaderPresent:Object.hasOwn(req.headers,'x-payload-signature'),httpStatus:response.status,signatureValidity:'See API signature-accepted stage; this receipt alone does not authenticate the sender.'};
        // Diagnostic only: never persist the raw body, signature, cookies or PII.
        await appendFile(resolve(root,'webhook-receipts.jsonl'),JSON.stringify(receipt)+'\n').catch(()=>{});
      }
      res.statusCode=response.status;
      for(const [key,value]of response.headers)if(!['transfer-encoding','content-encoding','content-length','set-cookie'].includes(key))res.setHeader(key,value);
      const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('set-cookie',cookies);
      if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();return;
    }
    const resolved = await resolveStaticFile(staticRoot, url.pathname);
    if (!resolved.file) {
      if (resolved.status === 404 && ['GET','HEAD'].includes(req.method) && (req.headers.accept ?? '').includes('text/html')) {
        const page = await readFile(resolve(staticRoot, '404.html')).catch(() => null);
        if (page) { res.writeHead(404, { 'Content-Type':'text/html; charset=utf-8', 'X-Robots-Tag':'noindex, nofollow' }); res.end(req.method === 'HEAD' ? undefined : page); return; }
      }
      res.writeHead(resolved.status).end(); return;
    }
    res.setHeader('Content-Type',types[extname(resolved.file)]??'application/octet-stream');
    res.end(req.method === 'HEAD' ? undefined : await readFile(resolved.file));
  } catch {res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Falha no ambiente isolado de homologação.'}));}
}).listen(Number(process.env.HOMOLOGATION_GATEWAY_PORT || 4174),'127.0.0.1',function () {
  console.log('Homologacao isolada: https://localhost:' + this.address().port + ' — checkout sandbox ' + (checkoutEnabled?'habilitado':'bloqueado'));
});
if (process.env.Portfolio__Supervised === 'true') {
  const { createInterface } = await import('node:readline');
  createInterface({ input: process.stdin }).on('line', line => { if (line === 'stop') server.close(); });
  server.on('close', () => process.exit(0));
}
