/* TV Neerstedt – Belastungssteuerung (ACWR-Tracking)
   ================================================================
   Zweite App neben der Spielstatistik-App, gleiches Firebase-Projekt
   (gleicher Kader, neue Collections: loadPins, trainingEntries).
   Architektur bewusst identisch zur Spielstatistik-App gehalten:
   lokal per IndexedDB voll offline nutzbar, synct sich automatisch
   über Firebase Firestore, sobald wieder Internet da ist. Fällt bei
   jedem Firebase-Fehler sauber auf lokalen Speicher zurück – die App
   darf nie abstürzen oder Daten verlieren. */

function uid(){ return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,9); }
function escapeHtml(s){ return (s==null?'':String(s)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function fmtDate(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}.${m}.${y}`; }
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.style.display='block';
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>{ el.style.display='none'; }, 2600);
}
async function safe(fn, fallbackMsg){
  try{ return await fn(); }
  catch(err){ console.error(err); toast(fallbackMsg || 'Aktion fehlgeschlagen – bitte erneut versuchen.'); return null; }
}

/* ================================ Dream And Do It – Branding ================================
   Logo-Grafik (rundes Icon) folgt, sobald die Bilddatei vorliegt – Platzhalter
   dafür ist unten markiert. Wortmarke/Tagline/Kontakt sind bereits final. */
function renderBrandCard(){
  return `
    <div class="card brand-card">
      <img class="brand-logo-img" src="icons/dream-and-do-it-logo.jpg" alt="Dream And Do It – Training und Coaching für Ihren Erfolg">
      <p class="sub">Fragen, Tipps oder Interesse an persönlichem Coaching? Nicholas Chilala hilft gern weiter:</p>
      <a class="btn btn-gold" href="mailto:info@dreamanddoit.de">✉️ info@dreamanddoit.de</a>
      <a class="btn btn-outline" href="https://www.dreamanddoit.de" target="_blank" rel="noopener">🌐 www.dreamanddoit.de</a>
    </div>
  `;
}

/* ================================ Gleiches Firebase-Projekt wie die Spielstatistik-App ================================
   Bewusst dieselben Werte wie in der Spielstatistik-App: ein Firebase-
   "Web-App"-Config ist nicht an eine einzelne Website gebunden, mehrere
   eigene Apps können dasselbe Projekt (und damit denselben Kader)
   nutzen. Die bestehenden Firestore-Regeln ("erlaubt für jeden
   angemeldeten Nutzer") gelten automatisch auch für die neuen
   Collections dieser App – es ist nichts zusätzlich einzurichten. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA1Q21tDBUvAxpIAQeT6Bun5licc9YTfGY",
  authDomain: "tvn-statistik-nicholas-chilala.firebaseapp.com",
  projectId: "tvn-statistik-nicholas-chilala",
  storageBucket: "tvn-statistik-nicholas-chilala.firebasestorage.app",
  messagingSenderId: "422323899846",
  appId: "1:422323899846:web:0f9509c61d7cd69e1cb6c7",
};
const CLOUD_SYNC_ENABLED = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'DEIN_API_KEY');
let CLOUD_SYNC_ACTIVE = CLOUD_SYNC_ENABLED;

let syncStatus = CLOUD_SYNC_ENABLED ? 'connecting' : 'local'; // connecting | online | offline | local | error
function setSyncStatus(s){ syncStatus = s; try{ renderSyncBadge(); }catch(_){} }
function renderSyncBadge(){
  const el = document.getElementById('sync-badge');
  if(!el) return;
  const map = {
    local:      {icon:'📴', text:'Nur lokal auf diesem Gerät gespeichert'},
    connecting: {icon:'☁️', text:'Verbinde mit Cloud-Synchronisation…'},
    online:     {icon:'☁️', text:'Cloud-Synchronisation aktiv'},
    offline:    {icon:'📴', text:'Cloud-Sync eingerichtet – gerade offline…'},
    error:      {icon:'⚠️', text:'Cloud-Sync-Fehler – Daten werden trotzdem lokal gespeichert'},
  };
  const s = map[syncStatus] || map.connecting;
  el.textContent = `${s.icon} ${s.text}`;
}
window.addEventListener('online', ()=> setSyncStatus(CLOUD_SYNC_ACTIVE ? 'online' : syncStatus));
window.addEventListener('offline', ()=> setSyncStatus(CLOUD_SYNC_ACTIVE ? 'offline' : syncStatus));

/* ================================ Lokaler Speicher (IndexedDB) ================================ */
const DB_NAME = 'tvnLoadDB_v1';
const DB_VERSION = 3;
let localDb = null;
function localOpenDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains('players')) db.createObjectStore('players',{keyPath:'id'});
      if(!db.objectStoreNames.contains('loadPins')) db.createObjectStore('loadPins',{keyPath:'id'});
      if(!db.objectStoreNames.contains('trainingEntries')){
        const st = db.createObjectStore('trainingEntries',{keyPath:'id'});
        st.createIndex('playerId','playerId',{unique:false});
      }
      if(!db.objectStoreNames.contains('coachComments')){
        const ct = db.createObjectStore('coachComments',{keyPath:'id'});
        ct.createIndex('playerId','playerId',{unique:false});
      }
      if(!db.objectStoreNames.contains('coachAuth')) db.createObjectStore('coachAuth',{keyPath:'id'});
    };
    req.onsuccess = ()=>{ localDb = req.result; resolve(); };
    req.onerror = ()=> reject(req.error);
  });
}
function storeTx(store, mode){ return localDb.transaction(store, mode).objectStore(store); }
function localGetAll(store){ return new Promise((res,rej)=>{ const r=storeTx(store,'readonly').getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
function localGetAllByIndex(store, indexName, key){ return new Promise((res,rej)=>{ const r=storeTx(store,'readonly').index(indexName).getAll(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
function localGet(store, id){ return new Promise((res,rej)=>{ const r=storeTx(store,'readonly').get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
function localPut(store, obj){ return new Promise((res,rej)=>{ const r=storeTx(store,'readwrite').put(obj); r.onsuccess=()=>res(obj); r.onerror=()=>rej(r.error); }); }
function localDelete(store, id){ return new Promise((res,rej)=>{ const r=storeTx(store,'readwrite').delete(id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); }); }

/* ================================ Cloud-Speicher (Firebase Firestore) ================================ */
let fsDb = null;
async function fsInitDB(){
  try{
    if(typeof firebase === 'undefined'){ throw new Error('Firebase-Bibliothek nicht geladen (kein Internet beim allerersten Start?)'); }
    firebase.initializeApp(FIREBASE_CONFIG);
    await firebase.auth().signInAnonymously();
    fsDb = firebase.firestore();
    try{ await fsDb.enablePersistence({synchronizeTabs:true}); }
    catch(e){ console.warn('Firestore-Offline-Cache konnte nicht aktiviert werden (z.B. mehrere offene Tabs).', e); }
    setSyncStatus(navigator.onLine===false ? 'offline' : 'online');
  }catch(err){
    console.error('Cloud-Sync konnte nicht initialisiert werden – nutze für diese Sitzung nur lokalen Speicher.', err);
    CLOUD_SYNC_ACTIVE = false;
    setSyncStatus('error');
    await localOpenDB();
  }
}
function fsGetAll(store){ return fsDb.collection(store).get().then(snap=> snap.docs.map(d=>d.data())); }
function fsGetAllByIndex(store, indexName, key){ return fsDb.collection(store).where(indexName,'==',key).get().then(snap=> snap.docs.map(d=>d.data())); }
function fsGet(store, id){ return fsDb.collection(store).doc(id).get().then(d=> d.exists? d.data() : undefined); }
function fsPut(store, obj){ return fsDb.collection(store).doc(obj.id).set(obj).then(()=>obj); }
function fsDelete(store, id){ return fsDb.collection(store).doc(id).delete(); }

async function openDB(){
  if(CLOUD_SYNC_ACTIVE){ await fsInitDB(); }
  else { await localOpenDB(); }
}
function idbGetAll(store){ return CLOUD_SYNC_ACTIVE ? fsGetAll(store) : localGetAll(store); }
function idbGetAllByIndex(store, indexName, key){ return CLOUD_SYNC_ACTIVE ? fsGetAllByIndex(store, indexName, key) : localGetAllByIndex(store, indexName, key); }
function idbGet(store, id){ return CLOUD_SYNC_ACTIVE ? fsGet(store, id) : localGet(store, id); }
function idbPut(store, obj){ return CLOUD_SYNC_ACTIVE ? fsPut(store, obj) : localPut(store, obj); }
function idbDelete(store, id){ return CLOUD_SYNC_ACTIVE ? fsDelete(store, id) : localDelete(store, id); }

/* ================================ Katalog ================================ */
const TRAINING_TYPES = {
  gym:      {label:'Gym',          icon:'🏋️'},
  handball: {label:'Handball',     icon:'🤾'},
  athletik: {label:'Athletik',     icon:'⚡'},
  cardio:   {label:'Cardio',       icon:'🏃'},
  freizeit: {label:'Freizeitsport',icon:'⚽'},
};
const RPE_LABELS = {1:'Sehr leicht',2:'Leicht',3:'Locker',4:'Moderat',5:'Etwas hart',6:'Hart',7:'Hart',8:'Sehr hart',9:'Sehr hart',10:'Maximal'};

/* ================================ ACWR-Berechnung ================================
   Belastung pro Einheit = RPE (1-10) × Dauer in Minuten (session-RPE-Methode,
   Foster et al.) – funktioniert für alle Trainingsarten ohne Zubehör.
   Akute Last = Ø Tageslast der letzten 7 Tage, Chronische Last = Ø Tageslast
   der letzten 28 Tage (ruhetage zählen als 0). ACWR = Akut ÷ Chronisch. */
function computeDailyLoad(entries){
  const map = {};
  entries.forEach(e=>{ map[e.date] = (map[e.date]||0) + (e.load||0); });
  return map;
}
function sumWindow(daily, asOf, days){
  let sum = 0;
  for(let i=0;i<days;i++){
    const d = new Date(asOf); d.setDate(d.getDate()-i);
    sum += daily[d.toISOString().slice(0,10)] || 0;
  }
  return sum;
}
function acwrForPlayer(entries, asOfISO){
  const asOf = asOfISO ? new Date(asOfISO) : new Date();
  const daily = computeDailyLoad(entries);
  const acute = sumWindow(daily, asOf, 7) / 7;
  const chronic = sumWindow(daily, asOf, 28) / 28;
  const firstDate = entries.reduce((min,e)=> (!min || e.date<min) ? e.date : min, null);
  const daysTracked = firstDate ? Math.floor((asOf - new Date(firstDate)) / 86400000) + 1 : 0;
  const acwr = chronic > 0 ? +(acute/chronic).toFixed(2) : null;
  let status = 'none';
  if(acwr!=null){
    if(acwr < 0.8) status = 'low';
    else if(acwr <= 1.3) status = 'ok';
    else if(acwr <= 1.5) status = 'warn';
    else status = 'high';
  }
  return { acute:+acute.toFixed(1), chronic:+chronic.toFixed(1), acwr, status, daysTracked, provisional: daysTracked < 28 };
}
const ACWR_STATUS_META = {
  none: {label:'Noch keine Daten', cls:'quote-flat'},
  low:  {label:'Deutlich unter Norm', cls:'quote-flat'},
  ok:   {label:'Im grünen Bereich', cls:'quote-up'},
  warn: {label:'Erhöht – im Blick behalten', cls:'quote-flat acwr-warn'},
  high: {label:'Hohes Risiko – Belastung reduzieren', cls:'quote-down'},
};
function acwrBadge(res){
  const meta = ACWR_STATUS_META[res.status];
  const val = res.acwr!=null ? res.acwr.toFixed(2) : '–';
  const dot = {none:'⚪',low:'🔵',ok:'🟢',warn:'🟡',high:'🔴'}[res.status];
  return `<div class="quote-badge ${meta.cls}"><b>${dot} ACWR ${val}</b> <span class="quote-detail">${meta.label}${res.provisional && res.acwr!=null ? ' · noch < 28 Tage Datenbasis' : ''}</span></div>`;
}

/* ================================ Regenerations-Tipps ================================
   Regelbasiert (keine KI-Anfrage nötig, funktioniert offline): kombiniert den
   aktuellen ACWR-Status mit der dominanten Trainingsart der letzten 7 Tage zu
   1-3 kurzen, allgemeinen Empfehlungen. Ersetzt keine medizinische/physio-
   therapeutische Beratung. */
const TYPE_RECOVERY_TIPS = {
  gym:      'Nach viel Krafttraining: Eiweißzufuhr über den Tag verteilen, Mobility/Stretching einbauen, beanspruchten Muskelgruppen wenn möglich 24–48h Pause geben.',
  handball: 'Nach intensiven Handball-Einheiten: Beweglichkeits- und Stabilisationsübungen, auf Schlafqualität achten, bei vielen Sprüngen/Sprints besonders auf Gelenke und Sehnen achten.',
  athletik: 'Nach Athletik-Einheiten: gezieltes Cool-down, Faszienrolle/Mobility, genug Zeit zwischen intensiven athletischen Reizen einplanen.',
  cardio:   'Nach viel Cardio: aktive Regeneration (lockeres Auslaufen/Radfahren), Kohlenhydrate zum Auffüllen der Glykogenspeicher, auf Flüssigkeits-/Elektrolytzufuhr achten.',
  freizeit: 'Freizeitsport zählt mit in die Gesamtbelastung – bewusst mit einplanen, damit es in Kombination mit dem Mannschaftstraining nicht zur versteckten Doppelbelastung kommt.',
};
const STATUS_RECOVERY_TIPS = {
  high: {icon:'🔴', text:'Die Belastung ist stark angestiegen. Bewusst 1–2 ruhigere Tage einplanen, Schlaf priorisieren (7–9h) und auf ausreichend Flüssigkeits-/Kohlenhydratzufuhr achten.'},
  warn: {icon:'🟡', text:'Die Belastung ist erhöht. Schlaf und Erholung im Blick behalten, wenn möglich eine ruhigere Einheit einbauen.'},
  ok:   {icon:'🟢', text:'Die Belastung liegt im empfohlenen Bereich – die aktuelle Steuerung passt so.'},
  low:  {icon:'🔵', text:'Die Belastung liegt aktuell deutlich unter dem üblichen Niveau. Ein vorsichtiger, schrittweiser Wiedereinstieg beugt Verletzungen vor.'},
  none: {icon:'⚪', text:'Noch zu wenige Daten für eine Einschätzung – nach den ersten Einheiten gibt es hier passende Hinweise.'},
};
function recoveryTips(entries, res){
  const tips = [];
  tips.push(STATUS_RECOVERY_TIPS[res.status] || STATUS_RECOVERY_TIPS.none);
  const cutoff = Date.now() - 7*86400000;
  const byType = {};
  entries.filter(e=>e.timestamp>=cutoff).forEach(e=>{ byType[e.type] = (byType[e.type]||0) + (e.load||0); });
  const dominant = Object.entries(byType).sort((a,b)=>b[1]-a[1])[0];
  if(dominant && TYPE_RECOVERY_TIPS[dominant[0]]){
    const t = TRAINING_TYPES[dominant[0]];
    tips.push({icon:t.icon, text:`Schwerpunkt der letzten 7 Tage: ${t.label}. ${TYPE_RECOVERY_TIPS[dominant[0]]}`});
  }
  return tips;
}
function renderTipsCard(entries, res){
  const tips = recoveryTips(entries, res);
  return `
    <div class="card">
      <div class="sub" style="margin-bottom:8px;">Regenerations-Tipps</div>
      ${tips.map(t=>`<div class="list-item"><div><div class="main">${t.icon} ${escapeHtml(t.text)}</div></div></div>`).join('')}
      <p class="sub" style="margin-top:8px;">Allgemeine Hinweise, keine medizinische oder physiotherapeutische Beratung – bei Beschwerden bitte Rücksprache mit Physio/Arzt halten.</p>
    </div>
  `;
}

/* ================================ State / Cache ================================ */
const state = { screen:'home', role: sessionRole(), currentPlayerId: rememberedPlayerId(), pinInput:'', logType:null, coachDetailId:null, entryDraftDate: todayISO(), commentScope:'general', commentEntryId:null, commentText:'' };
const cache = { players:[], entries:[], pins:{}, comments:[], coachPin:null };
function sessionRole(){ try{ return localStorage.getItem('tvnload_role') || null; }catch(e){ return null; } }
function rememberedPlayerId(){ try{ return localStorage.getItem('tvnload_playerId') || null; }catch(e){ return null; } }
function rememberSession(role, playerId){
  try{
    if(role) localStorage.setItem('tvnload_role', role); else localStorage.removeItem('tvnload_role');
    if(playerId) localStorage.setItem('tvnload_playerId', playerId); else localStorage.removeItem('tvnload_playerId');
  }catch(e){ /* localStorage evtl. nicht verfügbar – kein Problem, nur weniger Komfort */ }
}
/* Trainer-Zugang: eigene, von der Spieler-PIN unabhängige Geräte-Freischaltung.
   Schützt davor, dass jeder mit dem App-Link versehentlich im Trainer-Dashboard
   landet – ist aber (wie die gesamte App-Absicherung, siehe Firestore-Regeln)
   ein UX-Schutz auf App-Ebene, keine serverseitige Zugriffskontrolle. */
function coachAuthed(){ try{ return localStorage.getItem('tvnload_coachAuthed') === '1'; }catch(e){ return false; } }
function setCoachAuthed(v){
  try{ if(v) localStorage.setItem('tvnload_coachAuthed','1'); else localStorage.removeItem('tvnload_coachAuthed'); }
  catch(e){ /* kein Problem, nur weniger Komfort */ }
}
function go(screen, extra){ state.screen = screen; Object.assign(state, extra||{}); render(); window.scrollTo(0,0); }
function currentPlayer(){ return cache.players.find(p=>p.id===state.currentPlayerId); }
function playerEntries(playerId){ return cache.entries.filter(e=>e.playerId===playerId).sort((a,b)=> b.timestamp-a.timestamp); }
function activePlayers(){ return cache.players.filter(p=>p.active!==false).sort((a,b)=>a.lastName.localeCompare(b.lastName,'de')); }

async function reloadAll(){
  cache.players = await idbGetAll('players');
  cache.entries = await idbGetAll('trainingEntries');
  cache.comments = await idbGetAll('coachComments');
  const pins = await idbGetAll('loadPins');
  cache.pins = {}; pins.forEach(p=> cache.pins[p.id]=p.pin);
  const coachAuth = await idbGet('coachAuth', 'coach');
  cache.coachPin = coachAuth ? coachAuth.pin : null;
}
function playerComments(playerId){ return cache.comments.filter(c=>c.playerId===playerId).sort((a,b)=> b.createdAt-a.createdAt); }
function unreadCommentsCount(playerId){ return cache.comments.filter(c=>c.playerId===playerId && !c.read).length; }
function commentEntryLabel(c){
  if(!c.entryId) return 'Allgemeines Feedback';
  const e = cache.entries.find(x=>x.id===c.entryId);
  if(!e) return 'Zu einer gelöschten Einheit';
  const t = TRAINING_TYPES[e.type]? TRAINING_TYPES[e.type].label : e.type;
  return `Zu: ${t} – ${fmtDate(e.date)}`;
}

/* ================================ Initialisierung ================================ */
async function init(){
  await openDB();
  await reloadAll();
  registerSW();
  render();
}
function registerSW(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(err=> console.warn('Service Worker konnte nicht registriert werden.', err));
  }
}
window.addEventListener('DOMContentLoaded', init);

/* ================================ Screens ================================ */
function render(){
  const app = document.getElementById('app');
  let html = '';
  switch(state.screen){
    case 'home': html = screenHome(); break;
    case 'playerLogin': html = screenPlayerLogin(); break;
    case 'playerHome': html = screenPlayerHome(); break;
    case 'playerLog': html = screenPlayerLog(); break;
    case 'playerHistory': html = screenPlayerHistory(); break;
    case 'playerFeedback': html = screenPlayerFeedback(); break;
    case 'coachLogin': html = screenCoachLogin(); break;
    case 'coachDashboard': html = screenCoachDashboard(); break;
    case 'coachDetail': html = screenCoachDetail(); break;
    default: html = screenHome();
  }
  app.innerHTML = html;
  if(state.screen==='home' || state.screen==='playerHome' || state.screen==='coachDashboard') renderSyncBadge();
}

function topbar(title, sub, backTo){
  return `
    <div class="topbar">
      <div>
        ${backTo ? `<button class="back-btn" onclick="go('${backTo}')">‹ Zurück</button>` : ''}
        <h1>${title}</h1>
        ${sub? `<div class="sub">${sub}</div>`:''}
      </div>
    </div>
  `;
}

function screenHome(){
  return `
    <div class="topbar"><div><h1>TVN Belastungssteuerung</h1><div class="sub">1. Herren TV Neerstedt</div></div></div>
    ${renderBrandCard()}
    <div class="card">
      <p class="sub" style="margin-bottom:10px;">Wähle deinen Bereich:</p>
      <button class="btn btn-primary btn-block-lg" onclick="go('playerLogin')">Spieler-Ansicht</button>
      <button class="btn btn-outline btn-block-lg" onclick="goCoach()">Trainer-Dashboard</button>
    </div>
    <div id="sync-badge" class="footer-note"></div>
  `;
}
function goCoach(){
  state.pinInput = '';
  if(coachAuthed()){ go('coachDashboard'); }
  else { go('coachLogin'); }
}
function screenCoachLogin(){
  const hasPin = !!cache.coachPin;
  return `
    ${topbar('Trainer-Anmeldung', hasPin ? 'Bitte Trainer-PIN eingeben' : 'Noch keine Trainer-PIN vergeben', 'home')}
    <div class="card">
      <div class="field">
        <label>Trainer-PIN</label>
        <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" id="coach-pin-field" placeholder="z.B. 4321" value="${escapeHtml(state.pinInput)}" oninput="state.pinInput=this.value">
      </div>
      <button class="btn btn-gold" onclick="attemptCoachLogin()">Anmelden</button>
      ${hasPin
        ? `<p class="sub">Die Trainer-PIN kennen nur die Trainer – bitte nicht an Spieler weitergeben.</p>`
        : `<p class="sub">Diese PIN gilt für alle Trainer gemeinsam und wird jetzt einmalig festgelegt. Bitte danach nur an die Trainer weitergeben.</p>`}
    </div>
  `;
}
function attemptCoachLogin(){
  safe(async ()=>{
    const pin = (state.pinInput||'').trim();
    if(!pin){ toast('Bitte PIN eingeben.'); return; }
    if(!cache.coachPin){
      await idbPut('coachAuth', {id:'coach', pin});
      cache.coachPin = pin;
      toast('Trainer-PIN festgelegt.');
    } else if(cache.coachPin !== pin){
      toast('PIN stimmt nicht – bitte erneut versuchen.');
      return;
    }
    setCoachAuthed(true);
    go('coachDashboard');
  }, 'Anmeldung fehlgeschlagen.');
}
function coachLogout(){ setCoachAuthed(false); go('home'); }

function screenPlayerLogin(){
  const players = activePlayers();
  const selected = state.currentPlayerId;
  return `
    ${topbar('Spieler-Anmeldung', 'Name wählen und PIN eingeben', 'home')}
    <div class="card">
      ${players.length===0 ? `<p class="empty-hint">Kein Kader geladen. Der Kader wird aus der Spielstatistik-App übernommen – bitte einmal mit Internetverbindung öffnen.</p>` : `
      <div class="grid-players">
        ${players.map(p=>`<button class="player-btn" style="${selected===p.id?'background:var(--gold);border-color:var(--ocher);':''}" onclick="selectLoginPlayer('${p.id}')">
          <span class="name">${escapeHtml(p.firstName+' '+p.lastName)}</span>
          <span class="pos">${escapeHtml(p.position||'')}</span>
        </button>`).join('')}
      </div>`}
      ${selected ? `
        <hr class="sep">
        <div class="field">
          <label>PIN für ${escapeHtml(currentPlayer()? (currentPlayer().firstName):'')}</label>
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" id="pin-field" placeholder="z.B. 1234" value="${escapeHtml(state.pinInput)}" oninput="state.pinInput=this.value">
        </div>
        <button class="btn btn-gold" onclick="attemptPlayerLogin()">Anmelden</button>
        <p class="sub">Erste Anmeldung? Trag einfach eine beliebige PIN ein – sie wird für dich gespeichert.</p>
      ` : ''}
    </div>
  `;
}
function selectLoginPlayer(playerId){ state.currentPlayerId = playerId; state.pinInput=''; render(); }
function attemptPlayerLogin(){
  safe(async ()=>{
    const playerId = state.currentPlayerId;
    if(!playerId){ toast('Bitte zuerst einen Namen wählen.'); return; }
    const pin = (state.pinInput||'').trim();
    if(!pin){ toast('Bitte PIN eingeben.'); return; }
    const existing = cache.pins[playerId];
    if(existing == null){
      await idbPut('loadPins', {id:playerId, pin});
      cache.pins[playerId] = pin;
      toast('PIN gespeichert.');
    } else if(existing !== pin){
      toast('PIN stimmt nicht – bitte erneut versuchen.');
      return;
    }
    rememberSession('player', playerId);
    state.role = 'player';
    go('playerHome');
  }, 'Anmeldung fehlgeschlagen.');
}

function screenPlayerHome(){
  const p = currentPlayer();
  if(!p) return screenPlayerLogin();
  const entries = playerEntries(p.id);
  const res = acwrForPlayer(entries);
  const recent = entries.slice(0,5);
  const unread = unreadCommentsCount(p.id);
  return `
    <div class="topbar">
      <div><h1>Hallo, ${escapeHtml(p.firstName)}</h1><div class="sub">Deine Belastungsübersicht</div></div>
      <button class="back-btn" onclick="logoutPlayer()">Abmelden</button>
    </div>
    ${unread>0 ? `<div class="card" style="background:var(--gold); cursor:pointer;" onclick="go('playerFeedback')">
      <b style="color:var(--petrol);">🔔 ${unread} neue Rückmeldung${unread>1?'en':''} vom Trainer</b>
    </div>` : ''}
    <div class="scoreboard">
      ${acwrBadge(res)}
      <div class="meta" style="margin-top:8px;">Ø Last 7 Tage: <b>${res.acute}</b> · Ø Last 28 Tage: <b>${res.chronic}</b></div>
    </div>
    <button class="btn btn-primary btn-block-lg" onclick="openLogForm()">+ Einheit erfassen</button>
    ${renderTipsCard(entries, res)}
    <div class="card">
      <div class="sub" style="margin-bottom:8px;">Letzte Einheiten</div>
      ${recent.length===0 ? `<p class="empty-hint">Noch keine Einträge.</p>` : recent.map(entryRow).join('')}
    </div>
    <button class="btn btn-outline" onclick="go('playerHistory')">Kompletten Verlauf ansehen</button>
    <button class="btn btn-outline" onclick="go('playerFeedback')">Trainer-Feedback ansehen${unread>0?` (${unread} neu)`:''}</button>
    <div id="sync-badge" class="footer-note"></div>
  `;
}
function screenPlayerFeedback(){
  const p = currentPlayer();
  if(!p) return screenPlayerLogin();
  const comments = playerComments(p.id);
  const unreadIds = comments.filter(c=>!c.read).map(c=>c.id);
  if(unreadIds.length){
    safe(async ()=>{
      for(const id of unreadIds){
        const c = cache.comments.find(x=>x.id===id);
        c.read = true;
        await idbPut('coachComments', c);
      }
    }, null);
  }
  return `
    ${topbar('Trainer-Feedback', escapeHtml(p.firstName+' '+p.lastName), 'playerHome')}
    <div class="card">
      ${comments.length===0 ? `<p class="empty-hint">Noch kein Feedback vom Trainer.</p>` : comments.map(c=>`
        <div class="list-item">
          <div>
            <div class="main">${escapeHtml(commentEntryLabel(c))}</div>
            <div class="sub" style="white-space:normal;">${escapeHtml(c.text)}</div>
            <div class="sub">${new Date(c.createdAt).toLocaleString('de-DE')}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
function logoutPlayer(){ rememberSession(null,null); state.currentPlayerId=null; state.role=null; go('home'); }
function entryRow(e){
  const t = TRAINING_TYPES[e.type] || {label:e.type, icon:'•'};
  const extras = [];
  if(e.hr) extras.push(`Ø ${e.hr} bpm`);
  if(e.kcal) extras.push(`${e.kcal} kcal`);
  if(e.km) extras.push(`${e.km} km`);
  return `
    <div class="list-item">
      <div>
        <div class="main">${t.icon} ${escapeHtml(t.label)} – ${fmtDate(e.date)}</div>
        <div class="sub">${e.durationMin} Min · RPE ${e.rpe} (${RPE_LABELS[e.rpe]}) · Last ${e.load}${extras.length? ' · '+extras.join(' · '):''}</div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteEntry('${e.id}')">Löschen</button>
    </div>
  `;
}
function deleteEntry(id){
  safe(async ()=>{
    if(!confirm('Eintrag wirklich löschen?')) return;
    await idbDelete('trainingEntries', id);
    cache.entries = cache.entries.filter(e=>e.id!==id);
    toast('Eintrag gelöscht.');
    render();
  }, 'Löschen fehlgeschlagen.');
}

function openLogForm(){ state.logType=null; state.entryDraftDate = todayISO(); go('playerLog'); }
function screenPlayerLog(){
  const p = currentPlayer();
  if(!p) return screenPlayerLogin();
  return `
    ${topbar('Einheit erfassen', escapeHtml(p.firstName+' '+p.lastName), 'playerHome')}
    <div class="card">
      <div class="field">
        <label>Datum</label>
        <input type="date" id="entry-date" value="${state.entryDraftDate}" onchange="state.entryDraftDate=this.value">
      </div>
      <label>Trainingsart</label>
      <div class="grid2" style="margin-bottom:10px;">
        ${Object.entries(TRAINING_TYPES).map(([key,t])=>`
          <button class="event-menu-btn" style="${state.logType===key?'background:var(--gold); border-color:var(--ocher);':''}" onclick="state.logType='${key}'; render();">${t.icon} ${t.label}</button>
        `).join('')}
      </div>
      <div class="field">
        <label>Dauer (Minuten)</label>
        <input type="number" id="entry-duration" min="1" step="1" placeholder="z.B. 75">
      </div>
      <div class="field">
        <label>Anstrengung (RPE 1–10)</label>
        <input type="range" id="entry-rpe" min="1" max="10" step="1" value="5" oninput="document.getElementById('rpe-readout').textContent=this.value+' – '+({1:'Sehr leicht',2:'Leicht',3:'Locker',4:'Moderat',5:'Etwas hart',6:'Hart',7:'Hart',8:'Sehr hart',9:'Sehr hart',10:'Maximal'})[this.value]">
        <div class="sub" id="rpe-readout">5 – Etwas hart</div>
      </div>
      <hr class="sep">
      <div class="sub" style="margin-bottom:8px;">Zusatzangaben (optional)</div>
      <div class="grid2">
        <div class="field"><label>Ø Herzfrequenz</label><input type="number" id="entry-hr" min="0" placeholder="bpm"></div>
        <div class="field"><label>Kalorien</label><input type="number" id="entry-kcal" min="0" placeholder="kcal"></div>
      </div>
      <div class="field"><label>Distanz (km)</label><input type="number" id="entry-km" min="0" step="0.1" placeholder="km"></div>
      <button class="btn btn-gold btn-block-lg" onclick="saveEntry()">Speichern</button>
    </div>
  `;
}
function saveEntry(){
  safe(async ()=>{
    const p = currentPlayer(); if(!p) return;
    if(!state.logType){ toast('Bitte Trainingsart wählen.'); return; }
    const duration = parseInt(document.getElementById('entry-duration').value, 10);
    if(!duration || duration<=0){ toast('Bitte gültige Dauer eingeben.'); return; }
    const rpe = parseInt(document.getElementById('entry-rpe').value, 10);
    const hr = parseInt(document.getElementById('entry-hr').value, 10) || null;
    const kcal = parseInt(document.getElementById('entry-kcal').value, 10) || null;
    const km = parseFloat(document.getElementById('entry-km').value) || null;
    const date = document.getElementById('entry-date').value || todayISO();
    const entry = {
      id: uid(), playerId: p.id, date, timestamp: Date.now(),
      type: state.logType, durationMin: duration, rpe, load: rpe*duration,
      hr, kcal, km,
    };
    await idbPut('trainingEntries', entry);
    cache.entries.push(entry);
    toast('Einheit gespeichert.');
    go('playerHome');
  }, 'Speichern fehlgeschlagen.');
}

function screenPlayerHistory(){
  const p = currentPlayer();
  if(!p) return screenPlayerLogin();
  const entries = playerEntries(p.id);
  return `
    ${topbar('Verlauf', escapeHtml(p.firstName+' '+p.lastName), 'playerHome')}
    <div class="card">
      ${entries.length===0 ? `<p class="empty-hint">Noch keine Einträge.</p>` : entries.map(entryRow).join('')}
    </div>
  `;
}

/* ================================ Trainer-Dashboard ================================ */
function screenCoachDashboard(){
  const rows = activePlayers().map(p=>{
    const entries = playerEntries(p.id);
    const res = acwrForPlayer(entries);
    const last = entries[0];
    const daysSince = last ? Math.floor((Date.now()-last.timestamp)/86400000) : null;
    return {p, res, last, daysSince};
  });
  const order = {high:0, warn:1, none:2, low:3, ok:4};
  rows.sort((a,b)=> (order[a.res.status]-order[b.res.status]) || a.p.lastName.localeCompare(b.p.lastName,'de'));
  return `
    <div class="topbar"><div><h1>Trainer-Dashboard</h1><div class="sub">Belastungssteuerung 1. Herren</div></div>
    <button class="back-btn" onclick="go('home')">‹ Zurück</button></div>
    <div class="card">
      <button class="btn btn-gold" onclick="exportTeamXlsx()">Team als Excel exportieren</button>
      <p class="sub">Sortiert nach Risiko – rot zuerst. Kader wird aus der Spielstatistik-App übernommen.</p>
      <button class="btn btn-outline" style="margin-top:10px;" onclick="coachLogout()">🔒 Trainer abmelden (dieses Gerät)</button>
    </div>
    <div class="card">
      ${rows.length===0? `<p class="empty-hint">Kein Kader geladen.</p>` : rows.map(r=>`
        <div class="history-row" onclick="go('coachDetail',{coachDetailId:'${r.p.id}'})">
          <div class="top">
            <span>${{none:'⚪',low:'🔵',ok:'🟢',warn:'🟡',high:'🔴'}[r.res.status]} ${escapeHtml(r.p.firstName+' '+r.p.lastName)}</span>
            <span>ACWR ${r.res.acwr!=null? r.res.acwr.toFixed(2):'–'}</span>
          </div>
          <div class="sub">${r.last? `Letzte Einheit vor ${r.daysSince===0?'heute':r.daysSince+' Tag(en)'}` : 'Noch keine Einträge'}</div>
        </div>
      `).join('')}
    </div>
    <div id="sync-badge" class="footer-note"></div>
  `;
}

function screenCoachDetail(){
  const p = cache.players.find(x=>x.id===state.coachDetailId);
  if(!p) return screenCoachDashboard();
  const entries = playerEntries(p.id);
  const res = acwrForPlayer(entries);
  const daily = computeDailyLoad(entries);
  const weeks = [];
  const today = new Date();
  for(let w=7; w>=0; w--){
    let sum=0;
    for(let i=0;i<7;i++){
      const d = new Date(today); d.setDate(d.getDate() - (w*7+i));
      sum += daily[d.toISOString().slice(0,10)] || 0;
    }
    weeks.push(sum);
  }
  const maxW = Math.max(1, ...weeks);
  return `
    ${topbar(escapeHtml(p.firstName+' '+p.lastName), escapeHtml(p.position||''), 'coachDashboard')}
    <div class="scoreboard">${acwrBadge(res)}
      <div class="meta" style="margin-top:8px;">Ø Last 7 Tage: <b>${res.acute}</b> · Ø Last 28 Tage: <b>${res.chronic}</b></div>
    </div>
    <div class="card">
      <div class="sub" style="margin-bottom:8px;">Wochenlast (letzte 8 Wochen)</div>
      <div style="display:flex; align-items:flex-end; gap:6px; height:80px;">
        ${weeks.map(w=>`<div style="flex:1; background:var(--petrol); height:${Math.max(4,Math.round(w/maxW*80))}px; border-radius:4px 4px 0 0;" title="${Math.round(w)}"></div>`).join('')}
      </div>
    </div>
    ${renderTipsCard(entries, res)}
    <div class="card">
      <button class="btn btn-gold" onclick="exportPlayerXlsx('${p.id}')">Spieler als Excel exportieren</button>
    </div>
    <div class="card">
      <div class="sub" style="margin-bottom:8px;">Feedback an ${escapeHtml(p.firstName)} senden</div>
      <div class="field">
        <label>Bezug</label>
        <select id="comment-scope" onchange="state.commentScope=this.value; render();">
          <option value="general" ${state.commentScope==='general'?'selected':''}>Allgemeines Feedback</option>
          <option value="entry" ${state.commentScope==='entry'?'selected':''}>Zu einer bestimmten Einheit</option>
        </select>
      </div>
      ${state.commentScope==='entry' ? `
        <div class="field">
          <label>Einheit</label>
          <select id="comment-entry">
            ${entries.slice(0,20).map(e=>{
              const t = TRAINING_TYPES[e.type]? TRAINING_TYPES[e.type].label : e.type;
              return `<option value="${e.id}">${fmtDate(e.date)} – ${t} (${e.durationMin} Min, RPE ${e.rpe})</option>`;
            }).join('')}
          </select>
        </div>
      ` : ''}
      <div class="field">
        <label>Nachricht</label>
        <textarea id="comment-text" rows="3" placeholder="z.B. Starke Einheit, gut erholt wirken lassen bis Donnerstag."></textarea>
      </div>
      <button class="btn btn-gold" onclick="saveCoachComment('${p.id}')">Feedback senden</button>
    </div>
    <div class="card">
      <div class="sub" style="margin-bottom:8px;">Bisheriges Feedback</div>
      ${playerComments(p.id).length===0 ? `<p class="empty-hint">Noch kein Feedback gesendet.</p>` : playerComments(p.id).map(c=>`
        <div class="list-item">
          <div>
            <div class="main">${escapeHtml(commentEntryLabel(c))}</div>
            <div class="sub" style="white-space:normal;">${escapeHtml(c.text)}</div>
            <div class="sub">${new Date(c.createdAt).toLocaleString('de-DE')}${c.read?' · gelesen':' · ungelesen'}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="card">
      <div class="sub" style="margin-bottom:8px;">Alle Einträge</div>
      ${entries.length===0? `<p class="empty-hint">Noch keine Einträge.</p>` : entries.map(entryRow).join('')}
    </div>
  `;
}
function saveCoachComment(playerId){
  safe(async ()=>{
    const text = (document.getElementById('comment-text').value||'').trim();
    if(!text){ toast('Bitte eine Nachricht eingeben.'); return; }
    const entryId = state.commentScope==='entry' ? document.getElementById('comment-entry').value : null;
    const comment = { id: uid(), playerId, entryId, text, createdAt: Date.now(), read:false };
    await idbPut('coachComments', comment);
    cache.comments.push(comment);
    state.commentText=''; state.commentScope='general'; state.commentEntryId=null;
    toast('Feedback gesendet.');
    render();
  }, 'Feedback konnte nicht gesendet werden.');
}

/* ================================ EXPORT: EXCEL (SheetJS) ================================ */
async function saveFileBlob(filename, blob){
  if(typeof window.claude !== 'undefined' && window.claude && typeof window.claude.use === 'function'){
    try{
      const downloads = await window.claude.use('downloads');
      if(downloads){ await downloads.save({filename, data: blob}); toast('Datei gespeichert.'); return; }
      toast('Download in dieser Vorschau nicht verfügbar.');
      return;
    }catch(err){
      console.error('downloads.save fehlgeschlagen', err);
      if(err && err.code==='declined'){ return; }
      toast('Download nicht möglich (' + (err && err.code ? err.code : 'Fehler') + ').');
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Download gestartet.');
}
function entryToRow(e, playerName){
  const t = TRAINING_TYPES[e.type]? TRAINING_TYPES[e.type].label : e.type;
  return {
    Spieler: playerName||'', Datum: fmtDate(e.date), Trainingsart: t,
    'Dauer (Min)': e.durationMin, RPE: e.rpe, Last: e.load,
    'Ø HF': e.hr||'', Kalorien: e.kcal||'', km: e.km||'',
  };
}
function exportPlayerXlsx(playerId){
  safe(async ()=>{
    const p = cache.players.find(x=>x.id===playerId);
    const entries = playerEntries(playerId).slice().sort((a,b)=>a.timestamp-b.timestamp);
    const res = acwrForPlayer(entries);
    const wb = XLSX.utils.book_new();
    const infoWs = XLSX.utils.json_to_sheet([{ Spieler:p.firstName+' '+p.lastName, Position:p.position||'', 'Aktueller ACWR': res.acwr??'', 'Ø Last 7T': res.acute, 'Ø Last 28T': res.chronic }]);
    XLSX.utils.book_append_sheet(wb, infoWs, 'Übersicht');
    const rows = entries.map(e=>entryToRow(e, p.firstName+' '+p.lastName));
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Einheiten');
    const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
    const blob = new Blob([wbout], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    await saveFileBlob(`TVN_Belastung_${(p.firstName+'_'+p.lastName).replace(/[^a-z0-9]/gi,'_')}.xlsx`, blob);
  }, 'Export fehlgeschlagen.');
}
function exportTeamXlsx(){
  safe(async ()=>{
    const wb = XLSX.utils.book_new();
    const overview = activePlayers().map(p=>{
      const entries = playerEntries(p.id);
      const res = acwrForPlayer(entries);
      return { Spieler:p.firstName+' '+p.lastName, Position:p.position||'', ACWR: res.acwr??'', Status: ACWR_STATUS_META[res.status].label, 'Ø Last 7T': res.acute, 'Ø Last 28T': res.chronic, 'Anzahl Einheiten': entries.length };
    });
    const ovWs = XLSX.utils.json_to_sheet(overview);
    XLSX.utils.book_append_sheet(wb, ovWs, 'Team-Übersicht');
    const allRows = [];
    activePlayers().forEach(p=>{
      playerEntries(p.id).slice().sort((a,b)=>a.timestamp-b.timestamp).forEach(e=> allRows.push(entryToRow(e, p.firstName+' '+p.lastName)));
    });
    const allWs = XLSX.utils.json_to_sheet(allRows);
    XLSX.utils.book_append_sheet(wb, allWs, 'Alle Einheiten');
    const wbout = XLSX.write(wb, {bookType:'xlsx', type:'array'});
    const blob = new Blob([wbout], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    await saveFileBlob(`TVN_Belastung_Team_${todayISO()}.xlsx`, blob);
  }, 'Export fehlgeschlagen.');
}
