const express=require('express');
const session=require('express-session');
const bcrypt=require('bcryptjs');
const Database=require('better-sqlite3');
const path=require('path');
const fs=require('fs');

const app=express();
const dataDir=process.env.DATA_DIR||path.join(__dirname,'data');
fs.mkdirSync(dataDir,{recursive:true});
const db=new Database(process.env.DB_PATH||path.join(dataDir,'joshhub.db'));

db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL,
 created_at TEXT NOT NULL,
 xp INTEGER NOT NULL DEFAULT 0,
 bio TEXT NOT NULL DEFAULT '',
 avatar TEXT NOT NULL DEFAULT '⚡',
 role TEXT NOT NULL DEFAULT 'user'
);
CREATE TABLE IF NOT EXISTS chats(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 content TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS favorites(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 item_key TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(user_id,item_key),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// JOSH HUB OWNER: this username is permanently the owner/admin.
const adminUsername='josh';
if(adminUsername){db.prepare("UPDATE users SET role='admin' WHERE username=?").run(adminUsername)}

app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({
 secret:process.env.SESSION_SECRET||'change-this-secret-before-deploying',
 resave:false,saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:1000*60*60*24*7}
}));
app.use(express.static(path.join(__dirname,'public')));

const clean=s=>String(s??'').trim();
const now=()=>new Date().toISOString();
function userById(id){return db.prepare('SELECT id,username,created_at,xp,bio,avatar,role FROM users WHERE id=?').get(id)}
function levelFor(xp){return Math.floor(Number(xp||0)/100)+1}
function requireLogin(req,res,next){if(!req.session.userId)return res.status(401).json({error:'Login required'});next()}
function requireAdmin(req,res,next){if(!req.session.userId)return res.status(401).json({error:'Login required'});const u=userById(req.session.userId);if(!u||u.role!=='admin')return res.status(403).json({error:'Admin access required'});next()}

app.post('/api/signup',async(req,res)=>{
 const u=clean(req.body.username),p=String(req.body.password||'');
 if(!/^[a-zA-Z0-9_]{3,20}$/.test(u)||p.length<6)return res.status(400).json({error:'Username must be 3–20 letters/numbers/_ and password must be at least 6 characters.'});
 try{const hash=await bcrypt.hash(p,12);const role=(adminUsername&&u===adminUsername)?'admin':'user';const info=db.prepare('INSERT INTO users(username,password,created_at,role) VALUES(?,?,?,?)').run(u,hash,now(),role);req.session.userId=Number(info.lastInsertRowid);res.json({ok:true,user:userById(req.session.userId)})}
 catch(e){res.status(409).json({error:'That username is already taken.'})}
});
app.post('/api/login',async(req,res)=>{const u=clean(req.body.username),p=String(req.body.password||'');const user=db.prepare('SELECT * FROM users WHERE username=?').get(u);if(!user||!(await bcrypt.compare(p,user.password)))return res.status(401).json({error:'Incorrect username or password.'});req.session.userId=user.id;res.json({ok:true,user:userById(user.id)})});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>res.json({user:req.session.userId?userById(req.session.userId):null}));

app.get('/api/stats',(req,res)=>res.json({users:db.prepare('SELECT COUNT(*) c FROM users').get().c,chats:db.prepare('SELECT COUNT(*) c FROM chats').get().c,projects:6,online:Math.max(1,Math.min(99,db.prepare('SELECT COUNT(*) c FROM users').get().c))}));

app.get('/api/chats',requireLogin,(req,res)=>res.json({chats:db.prepare('SELECT id,title,content,created_at FROM chats WHERE user_id=? ORDER BY id DESC').all(req.session.userId)}));
app.post('/api/chats',requireLogin,(req,res)=>{const title=clean(req.body.title)||'New chat',content=String(req.body.content||'');if(!content)return res.status(400).json({error:'Chat content required'});const info=db.prepare('INSERT INTO chats(user_id,title,content,created_at) VALUES(?,?,?,?)').run(req.session.userId,title,content,now());db.prepare('UPDATE users SET xp=xp+10 WHERE id=?').run(req.session.userId);res.json({ok:true,id:Number(info.lastInsertRowid)})});
app.delete('/api/chats/:id',requireLogin,(req,res)=>{db.prepare('DELETE FROM chats WHERE id=? AND user_id=?').run(req.params.id,req.session.userId);res.json({ok:true})});
app.delete('/api/chats',requireLogin,(req,res)=>{db.prepare('DELETE FROM chats WHERE user_id=?').run(req.session.userId);res.json({ok:true})});

app.post('/api/profile',requireLogin,(req,res)=>{const bio=clean(req.body.bio).slice(0,160),avatar=clean(req.body.avatar).slice(0,4)||'⚡';db.prepare('UPDATE users SET bio=?,avatar=? WHERE id=?').run(bio,avatar,req.session.userId);res.json({ok:true,user:userById(req.session.userId)})});
app.get('/api/favorites',requireLogin,(req,res)=>res.json({favorites:db.prepare('SELECT item_key FROM favorites WHERE user_id=? ORDER BY id DESC').all(req.session.userId).map(x=>x.item_key)}));
app.post('/api/favorites/:key',requireLogin,(req,res)=>{const key=clean(req.params.key).slice(0,80);db.prepare('INSERT OR IGNORE INTO favorites(user_id,item_key,created_at) VALUES(?,?,?)').run(req.session.userId,key,now());db.prepare('UPDATE users SET xp=xp+2 WHERE id=?').run(req.session.userId);res.json({ok:true})});
app.delete('/api/favorites/:key',requireLogin,(req,res)=>{db.prepare('DELETE FROM favorites WHERE user_id=? AND item_key=?').run(req.session.userId,clean(req.params.key));res.json({ok:true})});

// Nova AI: uses an OpenAI-compatible endpoint when OPENAI_API_KEY is configured.
// For local development, set AI_BASE_URL to an OpenAI-compatible server such as Ollama.
app.post('/api/nova',requireLogin,async(req,res)=>{
 const message=clean(req.body.message).slice(0,6000);if(!message)return res.status(400).json({error:'Message required'});
 const base=(process.env.AI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'');
 const key=process.env.OPENAI_API_KEY||process.env.AI_API_KEY||'';
 const model=process.env.AI_MODEL||'gpt-4.1-mini';
 if(!key && !process.env.AI_BASE_URL)return res.json({demo:true,reply:'Nova is ready, but no AI provider is connected yet. Add OPENAI_API_KEY when you deploy, or set AI_BASE_URL for a local compatible AI server.'});
 try{
  const r=await fetch(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify({model,messages:[{role:'system',content:'You are Nova, the friendly AI inside JOSH HUB. Be concise, helpful, energetic and safe. Help with gaming, Roblox development, coding, MTB, content ideas and general questions.'},{role:'user',content:message}],temperature:0.7})});
  const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||`AI request failed (${r.status})`);
  const reply=data?.choices?.[0]?.message?.content||'Nova received the message but returned no text.';
  db.prepare('UPDATE users SET xp=xp+5 WHERE id=?').run(req.session.userId);
  res.json({reply,model});
 }catch(e){res.status(502).json({error:e.message||'Nova could not connect to the AI provider.'})}
});

app.get('/api/admin/users',requireAdmin,(req,res)=>res.json({users:db.prepare('SELECT id,username,created_at,xp,role FROM users ORDER BY id DESC').all()}));
app.post('/api/admin/users/:id/role',requireAdmin,(req,res)=>{const role=req.body.role==='admin'?'admin':'user';db.prepare('UPDATE users SET role=? WHERE id=?').run(role,req.params.id);res.json({ok:true})});
app.delete('/api/admin/users/:id',requireAdmin,(req,res)=>{if(Number(req.params.id)===req.session.userId)return res.status(400).json({error:'You cannot delete your own account.'});db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);res.json({ok:true})});

app.use((req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`JOSH HUB running on http://localhost:${PORT}`));
