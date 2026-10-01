// Dedicated loopback API for annex QA. Uses real services and an isolated restored DB.
// Does not load AppModule or any scheduled/external messaging integrations.
const http = require('node:http');
const { PrismaClient } = require('@prisma/client');
const { AnnexSourceService } = require('../dist/src/annexes/annex-source.service');
const { AnnexesService } = require('../dist/src/annexes/annexes.service');
const { CommercialProfilesService } = require('../dist/src/commercial-profiles/commercial-profiles.service');
const { selectAnnexMode } = require('../dist/src/annexes/annex-mode-selection');
const { calculateAnnex } = require('../dist/src/annexes/annex-engine');
const connection = new URL(process.env.DATABASE_URL || '');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname) || !connection.pathname.startsWith('/rev_annex_qa'))
  throw new Error('Only a local rev_annex_qa database is allowed.');
const db = new PrismaClient(), source = new AnnexSourceService(db), annexes = new AnnexesService(db), profiles = new CommercialProfilesService(db);
const origin = 'http://127.0.0.1:3197';
(async () => {
 const author = await db.user.findUniqueOrThrow({where:{email:'annex-qa@local.invalid'},select:{id:true}});
 http.createServer(async (req, res) => {
  res.setHeader('Content-Type','application/json');
  if (req.headers.origin && req.headers.origin !== origin) { res.writeHead(403); return res.end(JSON.stringify({message:'Local QA origin required'})); }
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') {res.writeHead(204);return res.end();}
  try {
   const url = new URL(req.url,'http://127.0.0.1'); let data;
   const sites = url.pathname.match(/^\/customers\/([^/]+)\/worksites$/);
   if (req.method === 'GET' && url.pathname === '/customers') data = await db.customer.findMany({select:{id:true,name:true},orderBy:{name:'asc'}});
   else if (req.method === 'GET' && sites) data = await db.customerWorksite.findMany({where:{customerId:sites[1]},select:{id:true,alias:true,worksite:{select:{name:true}}}});
   else if(req.method === 'GET' && url.pathname === '/commercial-profiles') data=await profiles.get(url.searchParams.get('scopeType'),url.searchParams.get('scopeId'));
   else if (req.method === 'GET' && url.pathname === '/employees') data = await db.employee.findMany({select:{id:true,name:true,lastName:true}});
   else if (req.method === 'GET' && url.pathname.startsWith('/auth/releases')) data = {acknowledged:true};
   else if (req.method === 'GET' && url.pathname === '/annexes/prepare') data = await source.prepare(...['customerWorksiteId','from','to','through'].map(k=>url.searchParams.get(k)));
   else if (req.method === 'GET' && url.pathname === '/annexes/drafts') data = await annexes.list(url.searchParams.get('customerWorksiteId'));
   else if (req.method === 'GET' && /^\/annexes\/drafts\/[^/]+$/.test(url.pathname)) data = await annexes.get(url.pathname.split('/').at(-1));
   else if ((req.method === 'POST' && ['/annexes/preview','/annexes/drafts','/annexes/select-mode'].includes(url.pathname)) || (req.method==='PUT' && url.pathname==='/commercial-profiles')) {
    let body=''; for await (const chunk of req) { body+=chunk;if(Buffer.byteLength(body)>2000000)throw new Error('Solicitud demasiado grande'); }
    const parsed=JSON.parse(body);data=url.pathname==='/annexes/select-mode'?selectAnnexMode(parsed):url.pathname==='/commercial-profiles'?await profiles.save(parsed,author.id):url.pathname.endsWith('/preview')?calculateAnnex(parsed):await annexes.save(parsed,author.id);
   } else {res.statusCode=404;data={message:'Entorno local para pruebas de anexos sobre copia de producción.'};}
   res.end(JSON.stringify(data));
  } catch(e) {res.statusCode=e.getStatus?.()||400;res.end(JSON.stringify({message:e.message}));}
 }).listen(4199,'127.0.0.1',()=>console.log('Annex QA: http://127.0.0.1:4199 · real services / local production snapshot'));
})().catch(async e=>{console.error(e.message);await db.$disconnect();process.exitCode=1});
