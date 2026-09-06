const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let user=null,authMode='login',currentChatId=null,chatMessages=[],adminSearchTimer=null;
const toast=(m)=>{const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500)};
async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);return d}
function setAuthButtons(){const logged=!!user;$('#loginBtn').classList.toggle('hidden',logged);$('#accountBtn').classList.toggle('hidden',!logged);$$('[data-auth-only]').forEach(x=>x.classList.toggle('hidden',!logged));$$('.admin-only').forEach(x=>x.classList.toggle('hidden',!logged||user.role!=='admin'));if(logged){$('#dashName').textContent=user.username;$('#dashAvatar').textContent=user.avatar;$('#profileUsername').value=user.username;$('#profileAvatarInput').value=user.avatar;$('#profileBio').value=user.bio;updateXP()}else{loadChats(false)}}
function updateXP(){const lvl=Math.floor((user.xp||0)/100)+1,prog=(user.xp||0)%100;$('#dashLevel').textContent=`Level ${lvl}`;$('#xpText').textContent=`${user.xp||0} XP`;$('#xpBar').style.width=prog+'%';$('#profileLevel').textContent=lvl;$('#profileXP').textContent=user.xp||0;$('#profileJoined').textContent=user.created_at?new Date(user.created_at).toLocaleDateString():'—';$('#profileAvatar').textContent=user.avatar}
async function refreshMe(){const d=await api('/api/me');user=d.user;setAuthButtons();if(user)loadChats(true)}
function openAuth(mode='login'){authMode=mode;$('#authModal').classList.add('show');$$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));$('#authTitle').innerHTML=mode==='login'?'<h2>Welcome back</h2><p>Enter the hub.</p>':'<h2>Create your account</h2><p>Join JOSH HUB.</p>';$('#authSubmit').textContent=mode==='login'?'LOGIN':'CREATE ACCOUNT';$('#authError').textContent=''}
async function auth(e){e.preventDefault();try{const d=await api(authMode==='login'?'/api/login':'/api/signup',{method:'POST',body:JSON.stringify({username:$('#authUser').value,password:$('#authPass').value})});user=d.user;$('#authModal').classList.remove('show');$('#authForm').reset();setAuthButtons();loadChats(true);toast(`Welcome to JOSH HUB, ${user.username}!`);location.hash='dashboard'}catch(err){$('#authError').textContent=err.message}}
async function loadChats(logged){const list=$('#chatList');if(!logged){list.innerHTML='<div class="muted">Log in to save chats.</div>';return}try{const d=await api('/api/chats');list.innerHTML=d.chats.length?d.chats.map(c=>`<div class="chat-item" data-id="${c.id}"><b>${escapeHtml(c.title)}</b><small>${new Date(c.created_at).toLocaleString()}</small></div>`).join(''):'<div class="muted">No saved chats yet.</div>';list.querySelectorAll('.chat-item').forEach(el=>el.onclick=()=>{const c=d.chats.find(x=>x.id==el.dataset.id);if(c){currentChatId=c.id;$('#messages').innerHTML='';c.content.split('\n\n').forEach((part,i)=>addMsg(i%2?'nova':'user',part))}})}catch(e){list.innerHTML='<div class="muted">Could not load history.</div>'}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function addMsg(type,text){const wrap=document.createElement('div');wrap.className='msg '+type;wrap.innerHTML=`<b>${type==='nova'?'Nova':'You'}</b><p>${escapeHtml(text)}</p>`;$('#messages').appendChild(wrap);$('#messages').scrollTop=$('#messages').scrollHeight}
async function novaSend(e){e.preventDefault();if(!user){openAuth('login');return}const input=$('#novaInput'),msg=input.value.trim();if(!msg)return;input.value='';addMsg('user',msg);const loading=document.createElement('div');loading.className='msg nova';loading.innerHTML='<b>Nova</b><p>Thinking… ⚡</p>';$('#messages').appendChild(loading);try{const d=await api('/api/nova',{method:'POST',body:JSON.stringify({message:msg})});loading.querySelector('p').textContent=d.reply;if(d.demo)toast('Nova is in demo mode — connect an AI provider to enable real answers.');chatMessages.push({role:'user',text:msg},{role:'nova',text:d.reply});await api('/api/chats',{method:'POST',body:JSON.stringify({title:msg.slice(0,45),content:chatMessages.map(x=>x.text).join('\n\n')})});const me=await api('/api/me');user=me.user;updateXP();loadChats(true)}catch(err){loading.querySelector('p').textContent='Nova error: '+err.message}}
async function favorites(){if(!user){$$('.fav').forEach(b=>b.onclick=()=>openAuth('login'));return}const d=await api('/api/favorites');const set=new Set(d.favorites);$$('.fav').forEach(b=>{const key=b.dataset.fav;b.textContent=set.has(key)?'★ Favourited':'☆ Favourite';b.onclick=async()=>{if(set.has(key)){await api('/api/favorites/'+encodeURIComponent(key),{method:'DELETE'});set.delete(key);b.textContent='☆ Favourite'}else{await api('/api/favorites/'+encodeURIComponent(key),{method:'POST'});set.add(key);b.textContent='★ Favourited';toast('Added to favourites!')}}})}
async function saveProfile(){try{const d=await api('/api/profile',{method:'POST',body:JSON.stringify({avatar:$('#profileAvatarInput').value,bio:$('#profileBio').value})});user=d.user;setAuthButtons();toast('Profile saved!')}catch(e){toast(e.message)}}

async function loadAnnouncements(){
 try{
  const d=await api('/api/announcements');
  const list=$('#announcementList');
  list.innerHTML=d.announcements.length?d.announcements.map(a=>`<article class="announcement-card"><div class="announcement-icon">📢</div><div><b>${escapeHtml(a.title)}</b><p>${escapeHtml(a.message)}</p><small>${new Date(a.created_at).toLocaleString()} · ${escapeHtml(a.created_by)}</small></div></article>`).join(''):'<div class="muted">No announcements yet.</div>';
 }catch(e){}
}

async function loadAdmin(){
 if(!user||user.role!=='admin')return;
 try{
  const [o,u,l]=await Promise.all([api('/api/admin/overview'),api('/api/admin/users?q='+encodeURIComponent($('#adminSearch').value.trim())),api('/api/admin/logs')]);
  $('#adminStats').innerHTML=[
   ['👥',o.users,'USERS'],['🟢',o.online,'ONLINE'],['👑',o.admins,'ADMINS'],['🚫',o.banned,'BANNED'],['💬',o.chats,'CHATS']
  ].map(x=>`<div class="admin-stat"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
  $('#adminUsers').innerHTML='<div class="admin-row admin-head"><span>User</span><span>Role</span><span>XP</span><span>Status</span><span>Actions</span></div>'+
    (u.users.length?u.users.map(x=>{
      const owner=x.username==='josh';
      return `<div class="admin-row"><span><b>${escapeHtml(x.username)}</b><small>${x.created_at?new Date(x.created_at).toLocaleDateString():''}</small></span><span>${x.role==='admin'?'👑 Admin':'User'}</span><span>${x.xp}</span><span>${x.banned?'🚫 Banned':'🟢 Active'}</span><span class="admin-actions">${owner?'<em>OWNER</em>':`
      <button class="btn small admin-role" data-id="${x.id}" data-role="${x.role}">${x.role==='admin'?'Demote':'Make admin'}</button>
      <button class="btn small admin-ban" data-id="${x.id}" data-banned="${x.banned}">${x.banned?'Unban':'Ban'}</button>
      <button class="btn small admin-xp" data-id="${x.id}" data-xp="${x.xp}">XP</button>
      <button class="btn small admin-name" data-id="${x.id}" data-name="${escapeHtml(x.username)}">Rename</button>
      <button class="btn small danger admin-delete" data-id="${x.id}">Delete</button>`}</span></div>`
    }).join(''):'<div class="muted">No users found.</div>');
  $$('.admin-role').forEach(b=>b.onclick=async()=>{try{await api('/api/admin/users/'+b.dataset.id+'/role',{method:'POST',body:JSON.stringify({role:b.dataset.role==='admin'?'user':'admin'})});toast('Role updated.');loadAdmin()}catch(e){toast(e.message)}});
  $$('.admin-ban').forEach(b=>b.onclick=async()=>{try{await api('/api/admin/users/'+b.dataset.id+'/ban',{method:'POST',body:JSON.stringify({banned:b.dataset.banned!=='1'})});toast(b.dataset.banned==='1'?'User unbanned.':'User banned.');loadAdmin()}catch(e){toast(e.message)}});
  $$('.admin-xp').forEach(b=>b.onclick=async()=>{const value=prompt('Set this user’s XP:',b.dataset.xp);if(value===null)return;try{await api('/api/admin/users/'+b.dataset.id+'/xp',{method:'POST',body:JSON.stringify({xp:value})});toast('XP updated.');loadAdmin()}catch(e){toast(e.message)}});
  $$('.admin-name').forEach(b=>b.onclick=async()=>{const value=prompt('New username:',b.dataset.name);if(!value)return;try{await api('/api/admin/users/'+b.dataset.id+'/username',{method:'POST',body:JSON.stringify({username:value})});toast('Username changed.');loadAdmin()}catch(e){toast(e.message)}});
  $$('.admin-delete').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this account permanently?'))return;try{await api('/api/admin/users/'+b.dataset.id,{method:'DELETE'});toast('User deleted.');loadAdmin()}catch(e){toast(e.message)}});
  $('#adminLogs').innerHTML='<div class="admin-row log-head"><span>Time</span><span>Admin</span><span>Action</span><span>Target</span><span>Details</span></div>'+
    (l.logs.length?l.logs.map(x=>`<div class="admin-row log-row"><span>${new Date(x.created_at).toLocaleString()}</span><span>${escapeHtml(x.admin_username)}</span><span>${escapeHtml(x.action)}</span><span>${escapeHtml(x.target_username||'—')}</span><span>${escapeHtml(x.details||'')}</span></div>`).join(''):'<div class="muted">No admin activity yet.</div>');
 }catch(e){toast(e.message)}
}

async function postAnnouncement(e){
 e.preventDefault();
 try{
  await api('/api/admin/announcement',{method:'POST',body:JSON.stringify({title:$('#announcementTitle').value,message:$('#announcementMessage').value})});
  $('#announcementForm').reset();toast('Announcement posted!');loadAnnouncements();loadAdmin();
 }catch(e){toast(e.message)}
}

$('#loginBtn').onclick=()=>openAuth('login');$('#heroLogin').onclick=()=>openAuth('signup');$('#accountBtn').onclick=()=>location.hash='profile';$('#authForm').onsubmit=auth;$$('.tab').forEach(b=>b.onclick=()=>openAuth(b.dataset.mode));$$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).classList.remove('show'));$('#novaForm').onsubmit=novaSend;$('#logoutBtn').onclick=async()=>{await api('/api/logout',{method:'POST'});user=null;setAuthButtons();toast('Logged out.');location.hash='home'};$('#newChat').onclick=()=>{$('#messages').innerHTML='<div class="msg nova"><b>Nova</b><p>New chat started. What are we building? ⚡</p></div>';chatMessages=[];currentChatId=null};$('#clearChats').onclick=async()=>{if(user){await api('/api/chats',{method:'DELETE'});loadChats(true);toast('Chat history cleared.')}};$('#saveProfile').onclick=saveProfile;$('#menuBtn').onclick=()=>$('#navLinks').classList.toggle('open');$$('.side-link').forEach(b=>b.onclick=()=>{location.hash=b.dataset.target});
$('#refreshAdmin').onclick=loadAdmin;$('#announcementForm').onsubmit=postAnnouncement;$('#adminSearch').oninput=()=>{clearTimeout(adminSearchTimer);adminSearchTimer=setTimeout(loadAdmin,250)};
window.addEventListener('hashchange',()=>{if(location.hash==='#admin')loadAdmin()});
setInterval(()=>{if(user)api('/api/me').then(d=>{user=d.user;setAuthButtons()}).catch(()=>{});},60000);
(async()=>{try{const s=await api('/api/stats');$('#statUsers').textContent=s.users;$('#statChats').textContent=s.chats;await loadAnnouncements();await refreshMe();await favorites()}catch(e){console.error(e)}})();
