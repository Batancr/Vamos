// Vamos online: accounts, ranked daily trips and the 1v1 lobby, stored in Supabase (supabase.com).
// The project URL and publishable key are meant to be public: the database rules in supabase/setup.sql
// decide what each player may read and write. Never put the secret (service_role) key in this file.
const ONLINE_CONFIG = window.VAMOS_ONLINE || { url: 'https://xpkdeclztdqyjbviyvdd.supabase.co', key: 'sb_publishable_zoN6GFoHsF-3vd4upAkEYA_KDyF_L9x' };
const SUPA_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
const MATCH_COLS = 'id,host,invited,guest,trip,status,host_hours,host_char,guest_hours,guest_char,created_at,finished_at';
// Characters that fly straight there make ranked trips trivial, so they're casual only.
const NOT_RANKED = ['genie', 'thunder', 'caped'];
const RUDE = /fuck|shit|cunt|nigg|fag|bitch|slut|whore|rape|nazi|hitler|dick|cock|puss|porn|sex|penis|vagin|anal|wank|twat/i;
const O = { sb: null, user: null, me: null, ranked: true, tab: 'rank', board: 'all', names: new Map(), stats: null, poll: 0, todo: 0, today: null };
try { O.ranked = localStorage.getItem('vamos.ranked') !== '0'; } catch {}

const onlineOn = () => !!(ONLINE_CONFIG.url && ONLINE_CONFIG.key);
function loadSupabase() {
  if (window.supabase) return Promise.resolve(window.supabase);
  return new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = SUPA_JS; s.onload = () => ok(window.supabase); s.onerror = fail;
    document.head.appendChild(s);
  });
}
async function initOnline() {
  renderAccount();
  if (!onlineOn()) return;
  try {
    const lib = await loadSupabase();
    O.sb = lib.createClient(ONLINE_CONFIG.url, ONLINE_CONFIG.key);
    O.sb.auth.onAuthStateChange((ev, session) => { setTimeout(() => setUser(session ? session.user : null), 0); });
    const { data } = await O.sb.auth.getSession();
    await setUser(data.session ? data.session.user : null);
  } catch { O.sb = null; renderAccount('Online play is not reachable right now. The game still works offline.'); }
}
async function setUser(u) {
  if (O.ready && (u ? u.id : null) === (O.user ? O.user.id : null)) return;
  O.ready = true; O.user = u; O.me = null; O.stats = null; O.today = null;
  if (u) {
    const { data } = await O.sb.from('profiles').select('id,username,progress').eq('id', u.id).maybeSingle();
    O.me = data;
    if (data) { O.names.set(data.id, data.username); mergeServerProgress(data.progress); refreshMine(); }
  }
  renderAccount(); onlineTripChanged(); checkInbox();
  clearInterval(O.poll); if (u) O.poll = setInterval(checkInbox, 60000);
}
// Progress follows the account: stats and badges from this browser and the server are combined.
function mergeServerProgress(srv) {
  if (srv && typeof srv.km === 'object' && srv.km) {
    const km = {}; for (const m in STAT_KM) { const v = srv.km[m]; if (typeof v === 'number' && v > 0 && v < 1e7) km[m] = v; }
    const badges = {}; for (const B of BADGES) if (srv.badges && srv.badges[B.id]) badges[B.id] = srv.badges[B.id];
    const done = Array.isArray(srv.done) ? srv.done.filter(k => typeof k === 'string').slice(-500) : [];
    const m = mergeProgress(S.progress, { km, badges, done });
    m.done = [...new Set([...done, ...S.progress.done])].slice(-500);
    S.progress = m; try { localStorage.setItem(PKEY, JSON.stringify(S.progress)); } catch {}
    if (S.fair) { renderModes(); renderTraveller(); } else changedStats(); // keep a result on screen when stats don't matter
  }
  pushProgress();
}
function pushProgress() {
  if (!O.me) return;
  clearTimeout(pushProgress.t);
  pushProgress.t = setTimeout(() => O.sb.from('profiles').update({ progress: S.progress, char: S.char }).eq('id', O.me.id).then(() => {}), 800);
}
async function refreshMine() {
  if (!O.me) return;
  const day = dailyTrip(Date.now()).no;
  const [lb, run] = await Promise.all([
    O.sb.from('leaderboard').select('username,points,trips').order('points', { ascending: false }).limit(1000),
    O.sb.from('runs').select('day,points').eq('user_id', O.me.id).eq('day', day).maybeSingle(),
  ]);
  const rows = lb.data || [], k = rows.findIndex(r => r.username === O.me.username);
  O.stats = k >= 0 ? { points: rows[k].points, trips: rows[k].trips, rank: k + 1 } : { points: 0, trips: 0, rank: null };
  O.today = run.data || null;
  renderAccount(); onlineTripChanged();
}

// ---------- the account bar at the top of the panel ----------
function renderAccount(msg) {
  const el = $('account'); if (!el) return;
  if (!onlineOn()) { el.innerHTML = '<span class="hint">👤 Accounts, ranked play and the 1v1 lobby switch on once the game\'s online database is set up.</span>'; return; }
  if (msg || !O.sb) { el.innerHTML = `<span class="hint">${esc(msg || 'Connecting…')}</span>`; return; }
  if (!O.user) {
    el.innerHTML = `<span>👤 <b>Sign in</b> to save progress, play ranked and join 1v1s.</span>
      <div class="row"><button class="btn small" id="oSignIn">Sign in</button><button class="btn small" id="oRank">🏆 Rankings</button><button class="btn small" id="oLobby">⚔️ 1v1 lobby</button></div>`;
  } else {
    const st = O.stats;
    el.innerHTML = `<span>👤 <b>${esc(O.me ? O.me.username : '…')}</b>${st ? ` · ${st.points.toLocaleString()} pts${st.rank ? ` · #${st.rank}` : ''}` : ''}</span>
      <div class="row">
        <div class="seg" role="group" aria-label="Play mode"><button class="btn small" id="oCasual" aria-pressed="${!O.ranked}">Casual</button><button class="btn small" id="oRanked" aria-pressed="${O.ranked}">Ranked</button></div>
        <button class="btn small" id="oRank">🏆</button><button class="btn small" id="oLobby">⚔️ 1v1${O.todo ? ` <i class="dot">${O.todo}</i>` : ''}</button><button class="btn small" id="oMe">👤</button>
      </div>
      <span class="hint" id="oRankNote"></span>`;
    $('oCasual').onclick = () => setRanked(false); $('oRanked').onclick = () => setRanked(true);
    $('oMe').onclick = () => openOnline('me');
  }
  if ($('oSignIn')) $('oSignIn').onclick = () => openOnline('me');
  $('oRank').onclick = () => openOnline('rank'); $('oLobby').onclick = () => openOnline('lobby');
  onlineTripChanged();
}
function setRanked(on) { O.ranked = on; try { localStorage.setItem('vamos.ranked', on ? '1' : '0'); } catch {} renderAccount(); }

// ---------- ranked: today's trip, Classic rules, Fair mode, first finish only ----------
function rankedState() {
  if (!O.me) return { ok: false };
  if (!O.ranked) return { ok: false, why: 'Casual: nothing is scored.' };
  if (S.match) return { ok: false, why: '' };
  const day = dailyTrip(Date.now()).no;
  if (S.tripNo !== day || S.challenge) return { ok: false, why: `Ranked play is today's trip #${day}. Other trips are casual.` };
  if (O.today) return { ok: false, why: `You scored ${O.today.points} on today's ranked trip. Come back tomorrow.` };
  if (S.progress.done.some(k => k.startsWith(day + '|'))) return { ok: false, why: 'You already finished today\'s trip (and saw the best route), so this try is casual.' };
  if (S.rules !== 'classic') return { ok: false, why: 'Ranked uses Classic rules. Switch rules to count this try.' };
  if (S.danger !== 'off') return { ok: false, why: 'Ranked is played with danger Off. Switch it off to count this try.' };
  if (!S.fair) return { ok: false, why: 'Ranked needs Fair mode on.' };
  if (NOT_RANKED.includes(S.char)) return { ok: false, why: `${CHARS[S.char].name} is too fast for ranked. Pick another character.` };
  return { ok: true, why: '🏆 Ranked: your first finish today scores up to 1,000 points.' };
}
function onlineTripChanged() { const n = $('oRankNote'); if (n) n.textContent = rankedState().why || (S.match ? '⚔️ 1v1 match in progress.' : ''); }
function onlineBeforeGo() { S.rankedTry = rankedState().ok; }
const hrs = h => h >= DEAD_H ? '💀 DNF' : fmtH(h);
const pointsFor = (you, best) => Math.min(1000, Math.round(1000 * best / you));

// Called by showResult. Adds the ranked score or the 1v1 outcome under the result.
async function onlineFinished(you, par, dq) {
  const box = $('onlineResult'); if (!box) return;
  pushProgress();
  if (S.match && !dq) {
    box.innerHTML = '<p class="hint">Sending your 1v1 time…</p>';
    const { data, error } = await O.sb.rpc('submit_match', { match_id: S.match.id, hours: you, route: encodeRoute(S.pts), ch: S.char });
    if (error) { box.innerHTML = `<p class="hint">Couldn't send your time: ${esc(error.message)}</p>`; return; }
    const m = await getMatch(S.match.id);
    box.innerHTML = matchOutcome(m) + '<div class="row"><button class="btn small" id="oSeeLobby">Open the 1v1 lobby</button></div>';
    $('oSeeLobby').onclick = () => openOnline('lobby'); checkInbox();
    return;
  }
  if (S.rankedTry && !dq && par) {
    S.rankedTry = false;
    const day = dailyTrip(Date.now()).no, pts = pointsFor(you, par);
    const { error } = await O.sb.from('runs').insert({ day, char: S.char, hours: you, best: par, route: encodeRoute(S.pts) });
    box.innerHTML = error ? `<p class="hint">Your ranked score didn't save: ${esc(error.message)}</p>`
      : `<div class="ranked">🏆 Ranked: <b>+${pts} points</b> <small>(1,000 × best route ÷ your time)</small></div>`;
    refreshMine();
  }
}

// ---------- 1v1 matches ----------
async function getMatch(id) { const { data } = await O.sb.from('matches').select(MATCH_COLS).eq('id', id).maybeSingle(); if (data) await nameIds([data]); return data; }
async function nameIds(ms) {
  const ids = [...new Set(ms.flatMap(m => [m.host, m.guest, m.invited, m.user_id]).filter(x => x && !O.names.has(x)))];
  if (ids.length) { const { data } = await O.sb.from('profiles').select('id,username').in('id', ids); for (const p of data || []) O.names.set(p.id, p.username); }
}
const nm = id => esc(O.names.get(id) || '?');
const tripOK = t => t && Array.isArray(t.f) && Array.isArray(t.t) && t.f.length === 3 && t.t.length === 3 && RULES[t.r] &&
  [t.f[1], t.f[2], t.t[1], t.t[2]].every(x => typeof x === 'number' && isFinite(x)) && Math.abs(t.f[1]) <= 90 && Math.abs(t.t[1]) <= 90;
const tripText = t => tripOK(t) ? `${esc(cleanName(t.f[0], 'Start').split(',')[0])} → ${esc(cleanName(t.t[0], 'Finish').split(',')[0])} · ${esc(RULES[t.r].name)}${t.d && t.d !== 'off' ? ` · ⚠️ ${t.d === 'custom' ? 'Custom' : DANGER[t.d] ? DANGER[t.d].name : ''}` : ''}` : 'Broken trip';
function matchOutcome(m) {
  if (!m) return '';
  const meHost = O.me && m.host === O.me.id, mine = meHost ? m.host_hours : m.guest_hours, theirs = meHost ? m.guest_hours : m.host_hours;
  const them = meHost ? (m.guest ? nm(m.guest) : m.invited ? nm(m.invited) : 'someone from the lobby') : nm(m.host);
  if (m.status === 'done') {
    const won = mine < theirs, tie = mine === theirs;
    return `<div class="ranked">${tie ? '🤝 A tie' : won ? '🏆 You won' : '😅 You lost'} against ${them}: ${hrs(mine)} vs ${hrs(theirs)}.</div>`;
  }
  return `<p class="hint">⚔️ Time sent${mine != null ? ` (${hrs(mine)})` : ''}. Waiting for ${them} to finish.</p>`;
}
function playMatch(m, role) {
  const t = m.trip; if (!tripOK(t)) { toast('That match trip is broken'); return; }
  S.rules = t.r; $('rules').value = t.r; $('rulesNote').textContent = RULES[t.r].note;
  startTrip({ from: cleanName(t.f[0], 'Start'), a: [t.f[1], t.f[2]], to: cleanName(t.t[0], 'Finish'), b: [t.t[1], t.t[2]] }, 0);
  S.match = { id: m.id, role }; S.seed = typeof t.s === 'number' ? t.s : 1;
  { const dc = t.d === 'custom' ? cleanCustom(t.dc) : null; setDanger(DANGER[t.d] && Object.hasOwn(DANGER, t.d) ? t.d : dc ? 'custom' : 'off', dc, true); }
  S.fair = true; $('fair').checked = true; $('fair').disabled = true; changedStats();
  const rival = role === 'host' ? (m.invited ? nm(m.invited) : 'the lobby') : nm(m.host);
  $('tripNo').textContent = `⚔️ 1v1 vs ${O.names.get(role === 'host' ? m.invited : m.host) || 'lobby'}`;
  toast(role === 'host' ? `Posted. Play it now: your time is the one ${rival} has to beat.` : `Match on! Beat ${rival}${m.host_hours ? `'s ${hrs(m.host_hours)}` : ''}.`, 3500);
  closeOnline(); onlineTripChanged();
}
// Shows a finished match on the map: both routes, like a friend challenge board.
async function showMatch(m) {
  const { data } = await O.sb.rpc('match_routes', { match_id: m.id });
  const r = (data && data[0]) || {}, t = m.trip, d = m.host_hours - m.guest_hours, tag = x => d === 0 ? 'tie' : (x < 0) === (d < 0) ? 'won' : 'lost';
  const c = { v: 1, id: 'm' + m.id, f: t.f, t: t.t, r: t.r, s: t.s || 1, d: DANGER[t.d] ? t.d : 'off', dc: cleanCustom(t.dc), res: [
    { n: O.names.get(m.host) || '?', h: m.host_hours, g: tag(-1), p: r.host_route || '', c: m.host_char || 'none' },
    { n: O.names.get(m.guest) || '?', h: m.guest_hours, g: tag(1), p: r.guest_route || '', c: m.guest_char || 'none' },
  ].sort((a, b) => a.h - b.h) };
  if (c.d === 'off' && c.dc) c.d = 'custom';
  S.rules = t.r; $('rules').value = t.r;
  startTrip({ from: cleanName(t.f[0], 'Start'), a: [t.f[1], t.f[2]], to: cleanName(t.t[0], 'Finish'), b: [t.t[1], t.t[2]] }, 0, c);
  S.finished = true; renderChallenge(); draw(); closeOnline();
}
async function postMatch(invitedName) {
  const t = { f: [S.trip.from, +S.trip.a[0].toFixed(3), +S.trip.a[1].toFixed(3)], t: [S.trip.to, +S.trip.b[0].toFixed(3), +S.trip.b[1].toFixed(3)], r: S.rules, s: 1 + Math.floor(Math.random() * 1e6), d: S.danger, dc: S.dcustom };
  let invited = null;
  if (invitedName) {
    const { data } = await O.sb.from('profiles').select('id,username').eq('username', invitedName).maybeSingle();
    if (!data) return `No player called ${esc(invitedName)}. Usernames match exactly, including capitals.`;
    if (data.id === O.me.id) return 'You can\'t challenge yourself.';
    invited = data.id; O.names.set(data.id, data.username);
  }
  const { data, error } = await O.sb.from('matches').insert({ trip: t, invited }).select(MATCH_COLS).single();
  if (error) return /row-level security/.test(error.message) ? 'You already have 5 open games. Cancel one first.' : error.message;
  playMatch(data, 'host'); checkInbox();
  return '';
}
// Counts what needs this player: invites, matches waiting on their time, and results they haven't seen.
async function checkInbox() {
  if (!O.me) { O.todo = 0; return; }
  const { data } = await O.sb.from('matches').select(MATCH_COLS).or(`host.eq.${O.me.id},guest.eq.${O.me.id},invited.eq.${O.me.id}`).in('status', ['open', 'playing', 'done']).order('created_at', { ascending: false }).limit(40);
  const ms = data || []; await nameIds(ms);
  let seen = []; try { seen = JSON.parse(localStorage.getItem('vamos.seen') || '[]'); } catch {}
  const fresh = ms.filter(m => m.status === 'done' && !seen.includes(m.id));
  if (fresh.length && O.inboxReady) { const m = fresh[0]; toast(`⚔️ Your 1v1 on ${tripText(m.trip)} is finished. Open the lobby to see who won.`, 4000); }
  O.inboxReady = true;
  O.todo = ms.filter(m => (m.status === 'open' && m.invited === O.me.id) || myTurn(m)).length + fresh.length;
  O.mine = ms; renderAccount();
}
const myTurn = m => O.me && ((m.host === O.me.id && m.host_hours == null && m.status !== 'done') || (m.guest === O.me.id && m.guest_hours == null && m.status === 'playing'));

// ---------- the online window: rankings, lobby, profile ----------
function openOnline(tab) {
  O.tab = tab; const d = $('online');
  if (!onlineOn()) { toast('Online play isn\'t switched on yet'); return; }
  if (!d.open) { d.showModal ? d.showModal() : d.setAttribute('open', ''); }
  renderOnline();
  clearInterval(O.lobbyPoll); O.lobbyPoll = setInterval(() => { if (d.open && O.tab === 'lobby') renderOnline(); }, 15000);
}
function closeOnline() { const d = $('online'); clearInterval(O.lobbyPoll); if (d.open) { d.close ? d.close() : d.removeAttribute('open'); } }
async function renderOnline() {
  const body = $('onlineBody'), tab = O.tab;
  $('online').querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === tab || (tab === 'player' && b.dataset.tab === 'rank')));
  if (!O.sb) { body.innerHTML = '<p class="hint">Online play is not reachable right now.</p>'; return; }
  if (tab === 'me' && !O.user) return renderSignIn(body);
  if (tab === 'me') return renderPlayer(body, O.me.username);
  if (tab === 'player') return renderPlayer(body, O.player);
  if (tab === 'rank') return renderRankings(body);
  if (tab === 'lobby') return renderLobby(body);
}
function renderSignIn(body, mode = O.signMode || 'in', msg = '') {
  O.signMode = mode;
  body.innerHTML = `<form id="oForm" class="oform">
    <div class="seg"><button type="button" class="btn small" data-m="in" aria-pressed="${mode === 'in'}">Sign in</button><button type="button" class="btn small" data-m="up" aria-pressed="${mode === 'up'}">Create account</button></div>
    ${mode === 'up' ? '<label>Username <small>3 to 16 letters, numbers or _ . Other players see this.</small><input class="txt" name="u" required minlength="3" maxlength="16" pattern="[A-Za-z0-9_]{3,16}" autocomplete="username"></label>' : ''}
    <label>Email <small>${mode === 'up' ? 'Only used to sign in. Never shown to anyone.' : ''}</small><input class="txt" name="e" type="email" required autocomplete="email"></label>
    <label>Password <small>${mode === 'up' ? 'At least 8 characters.' : ''}</small><input class="txt" name="p" type="password" required minlength="${mode === 'up' ? 8 : 1}" autocomplete="${mode === 'up' ? 'new-password' : 'current-password'}"></label>
    <button class="btn go" type="submit">${mode === 'up' ? 'Create account' : 'Sign in'}</button>
    <p class="hint" id="oMsg" aria-live="polite">${msg}</p>
    ${mode === 'in' ? '<button type="button" class="linkish" id="oForgot">Forgot your password?</button>' : '<p class="hint">Your stats and badges from this browser move into the account.</p>'}
  </form>`;
  body.querySelectorAll('[data-m]').forEach(b => b.onclick = () => renderSignIn(body, b.dataset.m));
  const say = t => { $('oMsg').textContent = t; };
  if ($('oForgot')) $('oForgot').onclick = async () => {
    const e = $('oForm').e.value.trim(); if (!e) { say('Type your email first.'); return; }
    const { error } = await O.sb.auth.resetPasswordForEmail(e, { redirectTo: location.href.split('#')[0] });
    say(error ? error.message : 'Check your email for a link to reset your password.');
  };
  $('oForm').onsubmit = async ev => {
    ev.preventDefault();
    const f = ev.target, e = f.e.value.trim(), p = f.p.value;
    if (mode === 'in') {
      say('Signing in…');
      const { error } = await O.sb.auth.signInWithPassword({ email: e, password: p });
      if (error) { say(/confirm/i.test(error.message) ? 'Confirm your email first: check your inbox for the link.' : 'That email and password don\'t match.'); return; }
      closeOnline(); toast('Signed in'); return;
    }
    const u = f.u.value.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(u)) { say('Usernames are 3 to 16 letters, numbers or _.'); return; }
    if (RUDE.test(u)) { say('Pick a different username.'); return; }
    say('Checking the username…');
    const free = await O.sb.rpc('username_free', { name: u });
    if (free.error) { say(free.error.message); return; }
    if (!free.data) { say(`${u} is taken. Try another.`); return; }
    const { data, error } = await O.sb.auth.signUp({ email: e, password: p, options: { data: { username: u }, emailRedirectTo: location.href.split('#')[0] } });
    if (error) { say(/database error/i.test(error.message) ? 'That username was just taken. Try another.' : error.message); return; }
    if (data.session) { closeOnline(); toast(`Welcome, ${u}!`); }
    else renderSignIn(body, 'in', `Almost done: open the link we emailed to ${esc(e)}, then sign in here.`);
  };
}
async function renderRankings(body) {
  const day = dailyTrip(Date.now()).no, all = O.board === 'all';
  body.innerHTML = `<div class="seg"><button class="btn small" data-b="all" aria-pressed="${all}">All time</button><button class="btn small" data-b="today" aria-pressed="${!all}">Today, trip #${day}</button></div><p class="hint">Loading…</p>`;
  body.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { O.board = b.dataset.b; renderRankings(body); });
  let rows;
  if (all) {
    const { data } = await O.sb.from('leaderboard').select('username,points,trips').order('points', { ascending: false }).limit(50);
    rows = (data || []).map(r => ({ n: r.username, right: `${r.points.toLocaleString()} pts · ${r.trips} trip${r.trips === 1 ? '' : 's'}` }));
  } else {
    const { data } = await O.sb.from('runs').select('user_id,points,hours,char').eq('day', day).order('points', { ascending: false }).order('hours').limit(50);
    await nameIds(data || []);
    rows = (data || []).map(r => ({ n: O.names.get(r.user_id) || '?', icon: CHARS[r.char] && r.char !== 'none' ? CHARS[r.char].icon + ' ' : '', right: `${hrs(r.hours)} · ${r.points} pts` }));
  }
  const me = O.me && O.me.username;
  body.querySelector('.hint').outerHTML = rows.length
    ? `<ol class="board">${rows.map((r, k) => `<li class="${r.n === me ? 'me' : ''}"><span>${['🥇', '🥈', '🥉'][k] || k + 1}</span><button class="linkish" data-p="${esc(r.n)}">${r.icon || ''}${esc(r.n)}</button><span class="t">${r.right}</span></li>`).join('')}</ol>`
    : `<p class="hint">${all ? 'No ranked scores yet. Be the first: play today\'s trip in Ranked mode.' : 'Nobody has played today\'s ranked trip yet.'}</p>`;
  body.insertAdjacentHTML('beforeend', '<p class="hint">Points: 1,000 × best route ÷ your time, on each day\'s trip with Classic rules and Fair mode. Only your first finish each day counts.</p>');
  body.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { O.player = b.dataset.p; O.tab = 'player'; renderOnline(); });
}
async function renderPlayer(body, name) {
  body.innerHTML = '<p class="hint">Loading…</p>';
  const { data: p } = await O.sb.from('profiles').select('id,username,progress,created_at').eq('username', name).maybeSingle();
  if (!p) { body.innerHTML = '<p class="hint">Player not found.</p>'; return; }
  const [lb, ms] = await Promise.all([
    O.sb.from('leaderboard').select('points,trips').eq('username', p.username).maybeSingle(),
    O.sb.from('matches').select('host,guest,host_hours,guest_hours').eq('status', 'done').or(`host.eq.${p.id},guest.eq.${p.id}`).limit(500),
  ]);
  let w = 0, l = 0; for (const m of ms.data || []) { const mine = m.host === p.id ? m.host_hours : m.guest_hours, th = m.host === p.id ? m.guest_hours : m.host_hours; if (mine < th) w++; else if (mine > th) l++; }
  const got = BADGES.filter(B => p.progress && p.progress.badges && p.progress.badges[B.id]);
  const self = O.me && p.id === O.me.id;
  body.innerHTML = `<h3 class="pname">👤 ${esc(p.username)}</h3>
    <div class="cmp"><span>Ranked points</span><span class="t">${((lb.data && lb.data.points) || 0).toLocaleString()}</span>
    <span>Ranked trips</span><span class="t">${(lb.data && lb.data.trips) || 0}</span>
    <span>1v1 record</span><span class="t">${w} won · ${l} lost</span>
    <span>Badges</span><span class="t">${got.length} of ${BADGES.length}</span></div>
    <p class="badgeline">${got.length ? got.map(B => `<span title="${esc(B.name)}">${B.icon}</span>`).join(' ') : '<span class="hint">No badges yet.</span>'}</p>
    ${self ? '<div class="row"><button class="btn small" id="oOut">Sign out</button></div><p class="hint">Your stats and badges save to this account automatically.</p>'
      : O.me ? `<div class="row"><button class="btn small" id="oDuel">⚔️ Challenge ${esc(p.username)} on the current trip</button></div><p class="hint" id="oDuelMsg"></p>` : ''}`;
  if ($('oOut')) $('oOut').onclick = async () => { await O.sb.auth.signOut(); closeOnline(); toast('Signed out'); };
  if ($('oDuel')) $('oDuel').onclick = async () => { const err = await postMatch(p.username); if (err) $('oDuelMsg').textContent = err; };
}
async function renderLobby(body) {
  if (!body.querySelector('.lobby')) body.innerHTML = '<p class="hint">Loading…</p>';
  const [open, mine] = await Promise.all([
    O.sb.from('matches').select(MATCH_COLS).eq('status', 'open').is('invited', null).order('created_at', { ascending: false }).limit(30),
    O.me ? O.sb.from('matches').select(MATCH_COLS).or(`host.eq.${O.me.id},guest.eq.${O.me.id},invited.eq.${O.me.id}`).in('status', ['open', 'playing', 'done']).order('created_at', { ascending: false }).limit(30) : { data: [] },
  ]);
  const lobby = (open.data || []).filter(m => !O.me || m.host !== O.me.id), my = mine.data || [];
  await nameIds([...lobby, ...my]);
  const invites = my.filter(m => m.status === 'open' && O.me && m.invited === O.me.id);
  const yours = my.filter(m => !invites.includes(m));
  const ago = t => { const h = (Date.now() - Date.parse(t)) / 36e5; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`; };
  const item = (m, actions, note) => `<li><div><b>${tripText(m.trip)}</b><small>${note} · ${ago(m.created_at)}</small></div><div class="row">${actions}</div></li>`;
  const state = m => {
    const meHost = m.host === O.me.id, them = meHost ? (m.guest ? nm(m.guest) : m.invited ? nm(m.invited) : 'anyone') : nm(m.host);
    if (m.status === 'done') { const mine = meHost ? m.host_hours : m.guest_hours, th = meHost ? m.guest_hours : m.host_hours; return [`<button class="btn small" data-see="${m.id}">Show routes</button>`, `vs ${them}: ${mine < th ? '🏆 you won' : mine > th ? 'you lost' : 'tie'}, ${hrs(mine)} vs ${hrs(th)}`]; }
    if (myTurn(m)) return [`<button class="btn small" data-play="${m.id}">Play</button>`, `vs ${them} · your turn${!meHost && m.host_hours ? `, beat ${hrs(m.host_hours)}` : ''}`];
    if (m.status === 'open') return [`<button class="btn small" data-cancel="${m.id}">Cancel</button>`, `waiting for ${them} to accept`];
    return ['', `vs ${them} · waiting for them to finish`];
  };
  body.innerHTML = `<div class="lobby">
    ${O.me ? `<div class="post"><div class="label">Post a 1v1</div>
      <p class="hint">Uses the trip on your map now: <b>${esc(S.trip.from.split(',')[0])} → ${esc(S.trip.to.split(',')[0])}</b> · ${esc(RULES[S.rules].name)} · Fair mode${S.danger !== 'off' ? ` · Danger: ${S.danger === 'custom' ? 'Custom' : DANGER[S.danger].name}` : ''}. You play first, then your rival tries to beat your time.</p>
      <div class="row"><input class="txt" id="oInvite" maxlength="16" placeholder="Username (empty = anyone)" aria-label="Invite a player by username"><button class="btn small" id="oPost">Post</button></div>
      <p class="hint" id="oPostMsg" aria-live="polite"></p></div>` : '<p class="hint">Sign in to post or accept a 1v1.</p>'}
    ${invites.length ? `<div class="label">Invites for you</div><ul class="mlist">${invites.map(m => item(m, `<button class="btn small" data-accept="${m.id}">Accept</button>`, `from ${nm(m.host)}${m.host_hours ? `, beat ${hrs(m.host_hours)}` : ''}`)).join('')}</ul>` : ''}
    <div class="label">Open games</div>
    ${lobby.length ? `<ul class="mlist">${lobby.map(m => item(m, O.me ? `<button class="btn small" data-accept="${m.id}">Accept</button>` : '', `by ${nm(m.host)}${m.host_hours ? `, time to beat ${hrs(m.host_hours)}` : ''}`)).join('')}</ul>` : '<p class="hint">No open games right now. Post one and check back.</p>'}
    ${O.me && yours.length ? `<div class="label">Your games</div><ul class="mlist">${yours.map(m => { const [a, n] = state(m); return item(m, a, n); }).join('')}</ul>` : ''}
    <p class="hint">This list refreshes every 15 seconds while it's open.</p></div>`;
  const byId = id => [...lobby, ...my].find(m => m.id === +id);
  if ($('oPost')) $('oPost').onclick = async () => { $('oPostMsg').textContent = 'Posting…'; const err = await postMatch($('oInvite').value.trim()); if (err) $('oPostMsg').textContent = err; };
  body.querySelectorAll('[data-accept]').forEach(b => b.onclick = async () => {
    const { error } = await O.sb.rpc('accept_match', { match_id: +b.dataset.accept });
    if (error) { toast(/no longer open/.test(error.message) ? 'Someone else got there first' : error.message); renderLobby(body); return; }
    playMatch(byId(b.dataset.accept), 'guest'); checkInbox();
  });
  body.querySelectorAll('[data-play]').forEach(b => b.onclick = () => { const m = byId(b.dataset.play); playMatch(m, m.host === O.me.id ? 'host' : 'guest'); });
  body.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => { await O.sb.rpc('cancel_match', { match_id: +b.dataset.cancel }); renderLobby(body); checkInbox(); });
  body.querySelectorAll('[data-see]').forEach(b => b.onclick = () => {
    const id = +b.dataset.see; let seen = []; try { seen = JSON.parse(localStorage.getItem('vamos.seen') || '[]'); } catch {}
    try { localStorage.setItem('vamos.seen', JSON.stringify([...seen, id].slice(-200))); } catch {}
    showMatch(byId(id)); checkInbox();
  });
  if (my.some(m => m.status === 'done')) {
    let seen = []; try { seen = JSON.parse(localStorage.getItem('vamos.seen') || '[]'); } catch {}
    const ids = my.filter(m => m.status === 'done').map(m => m.id);
    try { localStorage.setItem('vamos.seen', JSON.stringify([...new Set([...seen, ...ids])].slice(-200))); } catch {}
  }
}
$('online').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { O.tab = b.dataset.tab; renderOnline(); });
$('onlineClose').onclick = closeOnline;
$('online').addEventListener('close', () => { clearInterval(O.lobbyPoll); checkInbox(); });
window.Online = { beforeGo: onlineBeforeGo, finished: onlineFinished, tripChanged: onlineTripChanged, progressChanged: pushProgress };
initOnline();
