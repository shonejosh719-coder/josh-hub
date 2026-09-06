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
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL,
 created_at TEXT NOT NULL,
 xp INTEGER NOT NULL DEFAULT 0,
 bio TEXT NOT NULL DEFAULT '',
 avatar TEXT NOT NULL DEFAULT '⚡',
 role TEXT NOT NULL DEFAULT 'user',
 banned INTEGER NOT NULL DEFAULT 0,
 last_seen TEXT
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
CREATE TABLE IF NOT EXISTS announcements(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 message TEXT NOT NULL,
 created_at TEXT NOT NULL,
 created_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_logs(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 admin_username TEXT NOT NULL,
 action TEXT NOT NULL,
 target_username TEXT,
 details TEXT,
 created_at TEXT NOT NULL
);
`);

function ensureColumn(table,column,definition){
  const cols=db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
  if(!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn('users','banned','INTEGER NOT NULL DEFAULT 0');
ensureColumn('users','last_seen','TEXT');

const ownerUsername='josh';
db.prepare("UPDATE users SET role='admin',banned=0 WHERE username=?").run(ownerUsername);

app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({
 secret:process.env.SESSION_SECRET||'josh-hub-change-this-secret',
 resave:false,saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:1000*60*60*24*7}
}));
app.use(express.static(path.join(__dirname,'public')));

const clean=s=>String(s??'').trim();
const now=()=>new Date().toISOString();
const levelFor=xp=>Math.floor(Number(xp||0)/100)+1;
function userById(id){
  return db.prepare('SELECT id,username,created_at,xp,bio,avatar,role,banned,last_seen FROM users WHERE id=?').get(id);
}
function requireLogin(req,res,next){
  if(!req.session.userId)return res.status(401).json({error:'Login required'});
  const u=userById(req.session.userId);
  if(!u)return res.status(401).json({error:'Account not found'});
  if(u.banned)return res.status(403).json({error:'This account is banned.'});
  db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(),u.id);
  next();
}
function requireAdmin(req,res,next){
  if(!req.session.userId)return res.status(401).json({error:'Login required'});
  const u=userById(req.session.userId);
  if(!u||u.banned||u.role!=='admin')return res.status(403).json({error:'Admin access required'});
  db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(),u.id);
  next();
}
function logAdmin(admin,action,target='',details=''){
  db.prepare('INSERT INTO admin_logs(admin_username,action,target_username,details,created_at) VALUES(?,?,?,?,?)')
    .run(admin,action,target,details,now());
}

app.post('/api/signup',async(req,res)=>{
 const u=clean(req.body.username),p=String(req.body.password||'');
 if(!/^[a-zA-Z0-9_]{3,20}$/.test(u)||p.length<6)
   return res.status(400).json({error:'Username must be 3–20 letters/numbers/_ and password must be at least 6 characters.'});
 try{
   const hash=await bcrypt.hash(p,12);
   const role=u===ownerUsername?'admin':'user';
   const info=db.prepare('INSERT INTO users(username,password,created_at,role,last_seen) VALUES(?,?,?,?,?)')
     .run(u,hash,now(),role,now());
   req.session.userId=Number(info.lastInsertRowid);
   if(role==='admin')logAdmin(u,'Owner account created',u,'Permanent JOSH HUB owner');
   res.json({ok:true,user:userById(req.session.userId)});
 }catch(e){res.status(409).json({error:'That username is already taken.'})}
});

app.post('/api/login',async(req,res)=>{
 const u=clean(req.body.username),p=String(req.body.password||'');
 const user=db.prepare('SELECT * FROM users WHERE username=?').get(u);
 if(!user||!(await bcrypt.compare(p,user.password)))return res.status(401).json({error:'Incorrect username or password.'});
 if(user.banned)return res.status(403).json({error:'This account is banned.'});
 if(u===ownerUsername&&user.role!=='admin')db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);
 req.session.userId=user.id;
 db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(),user.id);
 res.json({ok:true,user:userById(user.id)});
});

app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get('/api/me',(req,res)=>{
  if(!req.session.userId)return res.json({user:null});
  const u=userById(req.session.userId);
  if(!u||u.banned){req.session.destroy(()=>{});return res.json({user:null})}
  db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(),u.id);
  res.json({user:userById(u.id)});
});

app.get('/api/stats',(req,res)=>{
 const users=db.prepare('SELECT COUNT(*) c FROM users').get().c;
 const chats=db.prepare('SELECT COUNT(*) c FROM chats').get().c;
 const online=db.prepare("SELECT COUNT(*) c FROM users WHERE last_seen IS NOT NULL AND datetime(last_seen)>=datetime('now','-5 minutes') AND banned=0").get().c;
 res.json({users,chats,projects:6,online});
});

app.get('/api/announcements',(req,res)=>{
 res.json({announcements:db.prepare('SELECT id,title,message,created_at,created_by FROM announcements ORDER BY id DESC LIMIT 8').all()});
});

app.get('/api/chats',requireLogin,(req,res)=>res.json({chats:db.prepare('SELECT id,title,content,created_at FROM chats WHERE user_id=? ORDER BY id DESC').all(req.session.userId)}));
app.post('/api/chats',requireLogin,(req,res)=>{
 const title=clean(req.body.title)||'New chat',content=String(req.body.content||'');
 if(!content)return res.status(400).json({error:'Chat content required'});
 const info=db.prepare('INSERT INTO chats(user_id,title,content,created_at) VALUES(?,?,?,?)').run(req.session.userId,title,content,now());
 db.prepare('UPDATE users SET xp=xp+10 WHERE id=?').run(req.session.userId);
 res.json({ok:true,id:Number(info.lastInsertRowid)});
});
app.delete('/api/chats/:id',requireLogin,(req,res)=>{db.prepare('DELETE FROM chats WHERE id=? AND user_id=?').run(req.params.id,req.session.userId);res.json({ok:true})});
app.delete('/api/chats',requireLogin,(req,res)=>{db.prepare('DELETE FROM chats WHERE user_id=?').run(req.session.userId);res.json({ok:true})});

app.post('/api/profile',requireLogin,(req,res)=>{
 const bio=clean(req.body.bio).slice(0,160),avatar=clean(req.body.avatar).slice(0,4)||'⚡';
 db.prepare('UPDATE users SET bio=?,avatar=? WHERE id=?').run(bio,avatar,req.session.userId);
 res.json({ok:true,user:userById(req.session.userId)});
});
app.get('/api/favorites',requireLogin,(req,res)=>res.json({favorites:db.prepare('SELECT item_key FROM favorites WHERE user_id=? ORDER BY id DESC').all(req.session.userId).map(x=>x.item_key)}));
app.post('/api/favorites/:key',requireLogin,(req,res)=>{const key=clean(req.params.key).slice(0,80);db.prepare('INSERT OR IGNORE INTO favorites(user_id,item_key,created_at) VALUES(?,?,?)').run(req.session.userId,key,now());db.prepare('UPDATE users SET xp=xp+2 WHERE id=?').run(req.session.userId);res.json({ok:true})});
app.delete('/api/favorites/:key',requireLogin,(req,res)=>{db.prepare('DELETE FROM favorites WHERE user_id=? AND item_key=?').run(req.session.userId,clean(req.params.key));res.json({ok:true})});

app.post('/api/nova',requireLogin,async(req,res)=>{
 const message=clean(req.body.message).slice(0,6000);
 if(!message)return res.status(400).json({error:'Message required'});
 const base=(process.env.AI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'');
 const key=process.env.OPENAI_API_KEY||process.env.AI_API_KEY||'';
 const model=process.env.AI_MODEL||'gpt-4.1-mini';
 if(!key&&!process.env.AI_BASE_URL)return res.json({demo:true,reply:'Nova is ready, but no AI provider is connected yet. Add OPENAI_API_KEY when you deploy, or set AI_BASE_URL for a local compatible AI server.'});
 try{
  const r=await fetch(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify({model,messages:[{role:'system',content:'You are Nova, the friendly AI inside JOSH HUB. Be concise, helpful, energetic and safe. Help with gaming, Roblox development, coding, MTB, content ideas and general questions.'},{role:'user',content:message}],temperature:0.7})});
  const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||`AI request failed (${r.status})`);
  const reply=data?.choices?.[0]?.message?.content||'Nova received the message but returned no text.';
  db.prepare('UPDATE users SET xp=xp+5 WHERE id=?').run(req.session.userId);
  res.json({reply,model});
 }catch(e){res.status(502).json({error:e.message||'Nova could not connect to the AI provider.'})}
});

// ADMIN HQ
app.get('/api/admin/overview',requireAdmin,(req,res)=>{
 const users=db.prepare('SELECT COUNT(*) c FROM users').get().c;
 const admins=db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c;
 const banned=db.prepare('SELECT COUNT(*) c FROM users WHERE banned=1').get().c;
 const chats=db.prepare('SELECT COUNT(*) c FROM chats').get().c;
 const online=db.prepare("SELECT COUNT(*) c FROM users WHERE last_seen IS NOT NULL AND datetime(last_seen)>=datetime('now','-5 minutes') AND banned=0").get().c;
 res.json({users,admins,banned,chats,online});
});

app.get('/api/admin/users',requireAdmin,(req,res)=>{
 const q=clean(req.query.q).slice(0,40);
 const users=q
  ?db.prepare("SELECT id,username,created_at,xp,role,banned,last_seen FROM users WHERE username LIKE ? ORDER BY id DESC").all('%'+q+'%')
  :db.prepare('SELECT id,username,created_at,xp,role,banned,last_seen FROM users ORDER BY id DESC').all();
 res.json({users});
});

app.post('/api/admin/users/:id/role',requireAdmin,(req,res)=>{
 const id=Number(req.params.id),target=userById(id),admin=userById(req.session.userId);
 if(!target)return res.status(404).json({error:'User not found.'});
 if(target.username===ownerUsername)return res.status(400).json({error:'The JOSH owner cannot be demoted.'});
 const role=req.body.role==='admin'?'admin':'user';
 db.prepare('UPDATE users SET role=? WHERE id=?').run(role,id);
 logAdmin(admin.username,role==='admin'?'Made admin':'Demoted',target.username,`Role changed to ${role}`);
 res.json({ok:true});
});

app.post('/api/admin/users/:id/ban',requireAdmin,(req,res)=>{
 const id=Number(req.params.id),target=userById(id),admin=userById(req.session.userId);
 if(!target)return res.status(404).json({error:'User not found.'});
 if(target.username===ownerUsername)return res.status(400).json({error:'The JOSH owner cannot be banned.'});
 const banned=req.body.banned?1:0;
 db.prepare('UPDATE users SET banned=? WHERE id=?').run(banned,id);
 logAdmin(admin.username,banned?'Banned user':'Unbanned user',target.username,banned?'Account access disabled':'Account access restored');
 res.json({ok:true});
});

app.post('/api/admin/users/:id/xp',requireAdmin,(req,res)=>{
 const id=Number(req.params.id),target=userById(id),admin=userById(req.session.userId);
 if(!target)return res.status(404).json({error:'User not found.'});
 let xp=Math.floor(Number(req.body.xp));
 if(!Number.isFinite(xp))return res.status(400).json({error:'XP must be a number.'});
 xp=Math.max(0,Math.min(1000000,xp));
 db.prepare('UPDATE users SET xp=? WHERE id=?').run(xp,id);
 logAdmin(admin.username,'Changed XP',target.username,`XP set to ${xp}`);
 res.json({ok:true,user:userById(id)});
});

app.post('/api/admin/users/:id/username',requireAdmin,(req,res)=>{
 const id=Number(req.params.id),target=userById(id),admin=userById(req.session.userId);
 if(!target)return res.status(404).json({error:'User not found.'});
 if(target.username===ownerUsername)return res.status(400).json({error:'The JOSH owner username cannot be changed.'});
 const username=clean(req.body.username);
 if(!/^[a-zA-Z0-9_]{3,20}$/.test(username))return res.status(400).json({error:'Username must be 3–20 letters/numbers/_.'});
 if(username===ownerUsername)return res.status(400).json({error:'That username is reserved for the JOSH owner.'});
 try{
   db.prepare('UPDATE users SET username=? WHERE id=?').run(username,id);
   logAdmin(admin.username,'Renamed user',target.username,`New username: ${username}`);
   res.json({ok:true});
 }catch(e){res.status(409).json({error:'That username is already taken.'})}
});

app.delete('/api/admin/users/:id',requireAdmin,(req,res)=>{
 const id=Number(req.params.id),target=userById(id),admin=userById(req.session.userId);
 if(!target)return res.status(404).json({error:'User not found.'});
 if(id===req.session.userId)return res.status(400).json({error:'You cannot delete your own account.'});
 if(target.username===ownerUsername)return res.status(400).json({error:'The JOSH owner cannot be deleted.'});
 db.prepare('DELETE FROM users WHERE id=?').run(id);
 logAdmin(admin.username,'Deleted user',target.username,'Account permanently removed');
 res.json({ok:true});
});

app.post('/api/admin/announcement',requireAdmin,(req,res)=>{
 const title=clean(req.body.title).slice(0,80),message=clean(req.body.message).slice(0,500),admin=userById(req.session.userId);
 if(!title||!message)return res.status(400).json({error:'Title and message are required.'});
 const info=db.prepare('INSERT INTO announcements(title,message,created_at,created_by) VALUES(?,?,?,?)').run(title,message,now(),admin.username);
 logAdmin(admin.username,'Posted announcement','',title);
 res.json({ok:true,id:Number(info.lastInsertRowid)});
});

app.delete('/api/admin/announcement/:id',requireAdmin,(req,res)=>{
 const admin=userById(req.session.userId);
 db.prepare('DELETE FROM announcements WHERE id=?').run(req.params.id);
 logAdmin(admin.username,'Deleted announcement','',`Announcement ${req.params.id}`);
 res.json({ok:true});
});

app.get('/api/admin/logs',requireAdmin,(req,res)=>{
 res.json({logs:db.prepare('SELECT id,admin_username,action,target_username,details,created_at FROM admin_logs ORDER BY id DESC LIMIT 100').all()});
});

app.use((req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log(`JOSH HUB running on http://localhost:${PORT}`));
