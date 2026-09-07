import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import argon2 from 'argon2';
import { authenticator } from 'otplib';

const app=express();
app.use(helmet());
app.use(express.json({limit:'1mb'}));
app.use(rateLimit({windowMs:15*60*1000,max:100,standardHeaders:true,legacyHeaders:false}));

// Production implementation point: load the single Admin record from PostgreSQL,
// verify Argon2id password, then require TOTP before issuing a secure session.
app.get('/health',(req,res)=>res.json({ok:true,service:'kka-knowledge-admin'}));
app.post('/auth/login',async(req,res)=>{
  // Deliberately fail closed until DATABASE_URL and a real session store are configured.
  if(!process.env.DATABASE_URL) return res.status(503).json({error:'Authentication backend is not configured'});
  return res.status(501).json({error:'Connect Admin credential verification and TOTP challenge to the production database before enabling login'});
});
app.post('/auth/totp',(req,res)=>res.status(501).json({error:'TOTP session issuance requires the production session store'}));
app.post('/auth/logout',(req,res)=>res.status(501).json({error:'Production session store not configured'}));
app.get('/me',(req,res)=>res.status(401).json({error:'Not authenticated'}));

const port=Number(process.env.PORT||8080);
app.listen(port,()=>console.log(`KKA Knowledge Admin listening on ${port}`));
