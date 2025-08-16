import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

export default async function handler(req:NextApiRequest, res:NextApiResponse){
  if(req.method!=='POST'){ res.status(405).send(''); return; }
  const from = String(req.body?.From||''); const body = String(req.body?.Body||'').trim().toUpperCase();
  if(!from){ res.status(200).send(''); return; }
  const phoneE164 = from;
  if(body==='STOP' || body==='STOP ALL'){ await prisma.subscriber.updateMany({ where:{ phoneE164 }, data:{ active:false }}); res.status(200).send('You are opted out. Reply START to resume.'); return; }
  if(body==='START'){ await prisma.subscriber.updateMany({ where:{ phoneE164 }, data:{ active:true }}); res.status(200).send('You are opted in.'); return; }
  res.status(200).send('');
}
