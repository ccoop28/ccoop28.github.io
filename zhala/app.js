/* Zhala: iPhone voice assistant (PWA). No build step, no dependencies.
   The API key lives only in this phone's localStorage and is only sent to Alibaba Model Studio. */
'use strict';

const VERSION = '1.0.0';
const DEFAULT_HOST = 'https://dashscope-intl.aliyuncs.com';  // Singapore / international region
const host = () => { const h = (settings().host || '').trim().replace(/\/+$/, ''); return /^https:\/\/[\w.-]+\.aliyuncs\.com$/.test(h) ? h : DEFAULT_HOST; };
const CHAT_PATH = '/compatible-mode/v1/chat/completions';
const TTS_PATH = '/api/v1/services/aigc/multimodal-generation/generation';
const TEAM_URL = '/hq-vkq4tmvp/data.json';                  // same origin on ccoop28.github.io
const TZ = 'Australia/Perth';
const HOME = { name: 'Perth, Western Australia', lat: -31.9523, lon: 115.8613 };

const MODELS = [
  ['qwen3.7-flash', 'qwen3.7-flash: fast, cheapest (default)'],
  ['qwen3.8-flash', 'qwen3.8-flash: newer, fast'],
  ['qwen3.7-plus', 'qwen3.7-plus: smarter, slower, pricier'],
  ['qwen-plus', 'qwen-plus: classic (no free quota)'],
  ['qwen-flash', 'qwen-flash: classic (no free quota)'],
];
// Female voices from Alibaba's Qwen-TTS voice list. None is advertised as a New York accent.
const VOICES_FLASH = [
  ['Jennifer', 'Jennifer: cinematic American English (default)'],
  ['Vivian', 'Vivian: confident, slightly feisty'],
  ['Katerina', 'Katerina: mature, rich rhythm'],
  ['Cherry', 'Cherry: sunny, friendly'],
  ['Serena', 'Serena: gentle'],
  ['Maia', 'Maia: smart and gentle'],
  ['Bella', 'Bella: bubbly, mischievous'],
  ['Momo', 'Momo: playful'],
  ['Sonrisa', 'Sonrisa: cheerful Latin American'],
  ['Elias', 'Elias: storyteller'],
  ['Bellona', 'Bellona: powerful, clear'],
];
const VOICES_INSTRUCT = VOICES_FLASH.filter(v => !['Jennifer', 'Sonrisa'].includes(v[0]))
  .map(v => v[0] === 'Vivian' ? ['Vivian', 'Vivian: confident, slightly feisty (default)'] : v);
const NY_INSTRUCTIONS = 'Speak in English with a confident, fast-talking New York City accent: ' +
  'warm, sharp and street-smart, punchy and direct, with a little attitude and a smile in the voice.';

const DEFAULTS = { host: '', model: 'qwen3.7-flash', ttsEngine: 'qwen3-tts-flash', voice: 'Jennifer', city: 'Perth', autoListen: false };
const LS = {
  get(k, d) { try { const v = localStorage.getItem('zhala.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('zhala.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('zhala.' + k); } catch {} },
};
const settings = () => ({ ...DEFAULTS, ...LS.get('settings', {}) });
const apiKey = () => (LS.get('apiKey', '') || '').trim();

const $ = id => document.getElementById(id);
const logEl = $('log'), statusEl = $('status'), micBtn = $('mic'), player = $('player');

let history = LS.get('history', []);
let state = 'idle';           // idle | listening | thinking | speaking
let recog = null;

/* ---------------------------------------------------------------- persona */
function systemPrompt() {
  return [
    'You are Zhala, Chase\'s personal voice assistant on his iPhone. You are an original character.',
    'Personality: a sharp, warm, confident woman with New York attitude. Quick, funny, straight-talking, never rude, always on Chase\'s side.',
    'Call him Chase. You are not a butler and you are not British. Never claim to be, or imitate, any real actor, celebrity or film character; if asked, say you are Zhala, an original voice.',
    'Your replies are spoken aloud: keep them to one to three short sentences unless Chase asks for detail. No markdown, lists, emojis, or URLs. Say numbers and times naturally.',
    'Use tools for time, weather, notes and the freelance team status. Only state numbers a tool returned. If a tool fails, say so plainly and never guess figures.',
    'Team data: mention only job titles and amounts, never client names, emails or handles.',
    'Chase lives in Perth, Western Australia (UTC+8). Right now it is ' + perthNow() + '.',
  ].join('\n');
}

/* ---------------------------------------------------------------- tools */
function perthNow() {
  return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date()) + ' Perth time';
}
const WMO = {0:'clear sky',1:'mostly clear',2:'partly cloudy',3:'overcast',45:'fog',48:'fog',51:'light drizzle',53:'drizzle',55:'heavy drizzle',61:'light rain',63:'rain',65:'heavy rain',66:'freezing rain',67:'freezing rain',71:'light snow',73:'snow',75:'heavy snow',80:'light showers',81:'showers',82:'heavy showers',95:'thunderstorms',96:'thunderstorms with hail',99:'thunderstorms with hail'};

async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function toolWeather(location) {
  let place = HOME;
  const loc = (location || settings().city || '').trim();
  if (loc && !/^(perth|home|here)$/i.test(loc)) {
    const g = await getJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(loc.split(',')[0]));
    const x = (g.results || [])[0];
    if (!x) return 'Could not find a place called ' + loc + '.';
    place = { name: [x.name, x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude };
  }
  const d = await getJSON('https://api.open-meteo.com/v1/forecast?timezone=auto&forecast_days=1' +
    '&latitude=' + place.lat + '&longitude=' + place.lon +
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  const c = d.current, t = d.daily;
  return place.name + ': now ' + Math.round(c.temperature_2m) + '°C, feels like ' + Math.round(c.apparent_temperature) +
    '°C, ' + (WMO[c.weather_code] || 'mixed conditions') + ', wind ' + Math.round(c.wind_speed_10m) + ' km/h. Today high ' +
    Math.round(t.temperature_2m_max[0]) + '°C, low ' + Math.round(t.temperature_2m_min[0]) + '°C, rain chance ' + t.precipitation_probability_max[0] + '%.';
}
function notes() { return LS.get('notes', []); }
function toolAddNote(text) {
  text = String(text || '').trim();
  if (!text) return 'Nothing to save.';
  const n = notes(); n.push({ text, ts: Date.now() }); LS.set('notes', n);
  return 'Saved note #' + n.length + ': ' + text;
}
function toolListNotes() {
  const n = notes();
  if (!n.length) return 'There are no notes yet.';
  return n.slice(-10).map((x, i) => (i + 1) + '. ' + x.text).join('\n');
}
function toolClearNotes() { const c = notes().length; LS.set('notes', []); return 'Cleared ' + c + ' notes.'; }

const scrub = s => String(s == null ? '' : s)
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email hidden]')
  .replace(/(^|\s)@\w{2,}/g, '$1[handle hidden]');
async function toolTeamStatus() {
  let d;
  try { d = await getJSON(TEAM_URL + '?t=' + Date.now(), { cache: 'no-store' }); }
  catch (e) { return 'TEAM_STATUS_FAILED: could not reach the team dashboard (' + e.message + '). No numbers are available; do not guess any.'; }
  const money = o => (o && typeof o === 'object') ? (o.display || 'unknown') : (o == null ? 'unknown' : String(o));
  const stage = name => ((d.pipeline_by_stage || []).find(s => s.stage === name) || {}).count;
  const offers = d.offers_out || {};
  const lines = [
    'Dashboard updated: ' + (d.updated || 'unknown') + '.',
    'Money received: ' + money(d.income_received) + '. Invoiced: ' + money(d.invoiced) + '.',
    'Offers out: ' + (offers.count ?? 'unknown') + ((offers.total || []).length ? ', worth ' + offers.total.join(' and ') + ' (separate currencies)' : '') + '.',
    'Client replies: ' + (d.replies ?? 'unknown') + '. Jobs won: ' + (stage('Won') ?? 'unknown') + '. Paid: ' + (stage('Paid') ?? 'unknown') + '.',
    'Leads found: ' + (d.leads_found ?? 'unknown') + '.',
  ];
  const open = (d.open_offers || []).slice(0, 5).map(o => scrub(o.title) + ' (' + scrub(o.price) + ', ' + scrub(o.status) + ')');
  if (open.length) lines.push('Top open offers: ' + open.join('; ') + '.');
  const waiting = (d.waiting_on_cc28 || []).map(w => scrub(w.what)).filter(Boolean);
  if (waiting.length) lines.push('Waiting on Chase: ' + waiting.join('; ') + '.');
  return lines.join('\n');
}

const TOOLS = [
  { name: 'get_time', description: 'Current date and time in Perth.', parameters: { type: 'object', properties: {} }, run: async () => perthNow() },
  { name: 'get_weather', description: 'Current weather and today\'s forecast. Defaults to Perth.', parameters: { type: 'object', properties: { location: { type: 'string', description: 'City name, optional' } } }, run: a => toolWeather(a.location) },
  { name: 'add_note', description: 'Save a note on Chase\'s phone.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, run: a => toolAddNote(a.text) },
  { name: 'list_notes', description: 'Read back saved notes.', parameters: { type: 'object', properties: {} }, run: async () => toolListNotes() },
  { name: 'clear_notes', description: 'Delete all saved notes. Only when Chase clearly asks.', parameters: { type: 'object', properties: {} }, run: async () => toolClearNotes() },
  { name: 'team_status', description: 'Live numbers from Chase\'s freelance team dashboard: money, offers, replies, wins, what is waiting on him.', parameters: { type: 'object', properties: {} }, run: () => toolTeamStatus() },
];
async function runTool(name, args) {
  const t = TOOLS.find(x => x.name === name);
  if (!t) return 'Unknown tool ' + name;
  try { return await t.run(args || {}); } catch (e) { return 'Tool ' + name + ' failed: ' + e.message; }
}

/* Offline / no-key intent router: answers the basics without the AI. */
async function localAnswer(text) {
  const q = text.toLowerCase();
  let m;
  if ((m = text.match(/\b(?:add|make|take|save|write)(?: a)? note(?: that| saying|:)?\s+(.+)/i)) || (m = text.match(/\bnote (?:that|down)\s+(.+)/i))) return toolAddNote(m[1]);
  if (/\b(clear|delete|wipe)\b.*\bnotes\b/.test(q)) return toolClearNotes();
  if (/\b(read|list|show|what are)\b.*\bnotes?\b/.test(q)) return toolListNotes();
  if (/\b(how are we (doing|going|tracking)|team|pipeline|dashboard|offers?|replies|income|been paid|money)\b/.test(q)) {
    const r = await toolTeamStatus();
    if (r.startsWith('TEAM_STATUS_FAILED')) return 'I couldn\'t reach the team dashboard, Chase, so I\'ve got no numbers for you.';
    const l = r.split('\n'); return l.slice(1, 4).join(' ');
  }
  if (/\b(weather|temperature|forecast|rain|hot|cold)\b/.test(q)) {
    m = q.match(/\bin ([a-z .'-]+?)[?.!]*$/);
    try { return await toolWeather(m ? m[1] : ''); } catch (e) { return 'The weather service isn\'t answering right now.'; }
  }
  if (/\b(time|date|day is it|what day)\b/.test(q)) return 'It\'s ' + perthNow() + '.';
  return null;
}

/* ---------------------------------------------------------------- brain */
async function chat(userText) {
  const key = apiKey();
  if (!key) {
    const local = await localAnswer(userText);
    return local || 'I need my brain switched on first, Chase. Tap the gear and paste in your Alibaba Model Studio key.';
  }
  const s = settings();
  const msgs = [{ role: 'system', content: systemPrompt() }, ...history.slice(-12), { role: 'user', content: userText }];
  const tools = TOOLS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  let noThinkFlag = true;
  for (let round = 0; round < 5; round++) {
    const body = { model: s.model, messages: msgs, tools, temperature: 0.7, max_tokens: 400 };
    if (noThinkFlag) body.enable_thinking = false;
    const r = await fetch(host() + CHAT_PATH, { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      if (r.status === 400 && noThinkFlag && /thinking/i.test(err)) { noThinkFlag = false; round--; continue; }
      if (r.status === 401) throw new Error('Alibaba says the API key is wrong. Check it in Settings.');
      if (/model.*(not|exist)|InvalidParameter.*model/i.test(err)) throw new Error('Alibaba doesn\'t recognise the model "' + s.model + '". Pick another in Settings.');
      if (/quota|Arrearage|balance/i.test(err)) throw new Error('Alibaba says the account is out of free quota or credit.');
      throw new Error('Alibaba error ' + r.status + ': ' + err.slice(0, 160));
    }
    const data = await r.json();
    const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
    const calls = msg.tool_calls || [];
    if (!calls.length) {
      const reply = cleanReply(msg.content);
      history.push({ role: 'user', content: userText }, { role: 'assistant', content: reply });
      history = history.slice(-24); LS.set('history', history);
      return reply || 'Sorry Chase, I blanked on that one. Say it again?';
    }
    msgs.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
    for (const c of calls) {
      let args = {};
      try { args = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : (c.function.arguments || {}); } catch {}
      setStatus('Checking ' + c.function.name.replace('_', ' ') + '…');
      const out = await runTool(c.function.name, args);
      msgs.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: String(out) });
    }
  }
  return 'That took too many steps, Chase. Try asking a simpler way.';
}
function cleanReply(t) {
  return String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/[*_`#>]+/g, '').replace(/https?:\/\/\S+/g, '').trim();
}

/* ---------------------------------------------------------------- voice out */
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
let unlocked = false;
function unlockAudio() {          // must run inside a tap so iOS lets us play audio later
  if (unlocked) return; unlocked = true;
  try { player.src = SILENT; const p = player.play(); if (p) p.catch(() => {}); } catch {}
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch {}
}
function pickDeviceVoice() {
  const vs = ('speechSynthesis' in window) ? speechSynthesis.getVoices() : [];
  const us = vs.filter(v => /^en[-_]US/i.test(v.lang));
  const pref = ['Samantha', 'Ava', 'Allison', 'Susan', 'Zoe', 'Nicky', 'Evan'];
  for (const p of pref) { const v = us.find(x => x.name.includes(p)); if (v) return v; }
  return us.find(v => /female|woman/i.test(v.name)) || us[0] || vs.find(v => /^en/i.test(v.lang)) || null;
}
function speakDevice(text) {
  return new Promise(res => {
    if (!('speechSynthesis' in window)) return res();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickDeviceVoice(); if (v) u.voice = v;
    u.lang = (v && v.lang) || 'en-US'; u.rate = 1.05; u.pitch = 1.0;
    u.onend = u.onerror = () => res();
    speechSynthesis.speak(u);
  });
}
async function qwenTTS(text, s) {
  const input = { text: text.slice(0, 590), voice: s.voice, language_type: 'English' };
  if (s.ttsEngine === 'qwen3-tts-instruct-flash') { input.instructions = NY_INSTRUCTIONS; input.optimize_instructions = true; }
  const r = await fetch(host() + TTS_PATH, { method: 'POST', headers: { 'Authorization': 'Bearer ' + apiKey(), 'Content-Type': 'application/json' }, body: JSON.stringify({ model: s.ttsEngine, input }) });
  if (!r.ok) throw new Error('TTS ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 120));
  const d = await r.json();
  const a = d.output && d.output.audio;
  if (a && a.url) return a.url.replace(/^http:\/\//, 'https://');   // page is https; avoid mixed content
  if (a && a.data) return 'data:audio/wav;base64,' + a.data;
  throw new Error('TTS returned no audio');
}
function playUrl(url) {
  return new Promise((res, rej) => {
    player.onended = () => res(); player.onerror = () => rej(new Error('audio playback failed'));
    player.src = url;
    const p = player.play(); if (p) p.catch(rej);
  });
}
async function speak(text) {
  const s = settings();
  setState('speaking'); setStatus('Zhala is talking… tap to stop');
  try {
    if (s.ttsEngine !== 'device' && apiKey()) {
      try { await playUrl(await qwenTTS(text, s)); return; }
      catch (e) { console.warn('Qwen voice failed, using iPhone voice:', e.message); }
    }
    await speakDevice(text);
  } finally { if (state === 'speaking') setState('idle'); }
}
function stopSpeaking() {
  try { player.pause(); } catch {}
  try { speechSynthesis.cancel(); } catch {}
  setState('idle');
}

/* ---------------------------------------------------------------- voice in */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen() {
  if (!SR) { setStatus('Voice input isn\'t available here: type below, or use the keyboard mic'); $('textInput').focus(); return; }
  recog = new SR();
  recog.lang = 'en-AU'; recog.interimResults = true; recog.continuous = false; recog.maxAlternatives = 1;
  let finalText = '', interim = '';
  recog.onresult = e => {
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
    }
    setStatus((finalText + interim) || 'Listening…');
  };
  recog.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setStatus('Mic blocked. Allow Microphone and Speech Recognition for Safari in iPhone Settings, or type below.');
    else if (e.error === 'no-speech') setStatus('Didn\'t catch that. Tap to try again.');
    else setStatus('Mic error: ' + e.error);
  };
  recog.onend = () => {
    recog = null;
    const t = (finalText || interim).trim();
    if (state === 'listening') setState('idle');
    if (t) handle(t);
  };
  try { recog.start(); setState('listening'); setStatus('Listening…'); }
  catch (e) { setStatus('Couldn\'t start the mic: ' + e.message); setState('idle'); }
}

/* ---------------------------------------------------------------- flow */
async function handle(text) {
  addMsg('me', text);
  setState('thinking'); setStatus('Thinking…');
  let reply;
  try { reply = await chat(text); }
  catch (e) {
    console.warn(e);
    const local = await localAnswer(text).catch(() => null);
    reply = local || e.message || 'Something went wrong talking to Alibaba.';
  }
  addMsg('zhala', reply);
  await speak(reply);
  setStatus('Tap to talk');
  if (settings().autoListen && state === 'idle') listen();
}
function setState(s) { state = s; micBtn.className = 'mic ' + (s === 'idle' ? '' : s); }
function setStatus(t) { statusEl.textContent = t; }
function addMsg(who, text) {
  const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text;
  logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight;
}

micBtn.addEventListener('click', () => {
  unlockAudio();
  if (state === 'listening') { try { recog && recog.stop(); } catch {} return; }
  if (state === 'speaking') { stopSpeaking(); setStatus('Tap to talk'); return; }
  if (state === 'thinking') return;
  listen();
});
$('textForm').addEventListener('submit', e => {
  e.preventDefault(); unlockAudio();
  const t = $('textInput').value.trim(); if (!t || state === 'thinking') return;
  $('textInput').value = ''; $('textInput').blur();
  if (state === 'speaking') stopSpeaking();
  handle(t);
});

/* ---------------------------------------------------------------- settings */
function fillSelect(sel, items, value) {
  sel.innerHTML = '';
  for (const [v, label] of items) { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); }
  sel.value = items.some(i => i[0] === value) ? value : items[0][0];
}
function refreshVoiceField(resetToDefault) {
  const eng = $('ttsEngine').value;
  $('voiceField').hidden = eng === 'device';
  const list = eng === 'qwen3-tts-instruct-flash' ? VOICES_INSTRUCT : VOICES_FLASH;
  const cur = resetToDefault ? '' : ($('voice').value || settings().voice);
  fillSelect($('voice'), list, list.some(v => v[0] === cur) ? cur : list[0][0]);
  $('voiceHint').textContent = eng === 'qwen3-tts-instruct-flash'
    ? 'Asks the voice for a New York accent. Results vary; tap Test voice.'
    : 'Alibaba has no New York preset. Jennifer is the American English voice; try Instruct for the accent.';
}
function openSettings() {
  const s = settings();
  $('apiKey').value = apiKey();
  fillSelect($('model'), MODELS, s.model);
  $('ttsEngine').value = s.ttsEngine;
  $('voice').innerHTML = ''; refreshVoiceField(); $('voice').value = s.voice; if (!$('voice').value) refreshVoiceField(true);
  $('host').value = s.host || '';
  $('city').value = s.city; $('autoListen').checked = !!s.autoListen;
  $('main').hidden = true; $('settings').hidden = false;
}
function saveSettings() {
  const k = $('apiKey').value.trim();
  if (k) LS.set('apiKey', k); else LS.del('apiKey');
  LS.set('settings', { host: $('host').value.trim(), model: $('model').value, ttsEngine: $('ttsEngine').value, voice: $('voice').value, city: $('city').value.trim() || 'Perth', autoListen: $('autoListen').checked });
}
function closeSettings() { $('settings').hidden = true; $('main').hidden = false; updateBanner(); }
$('openSettings').addEventListener('click', openSettings);
$('closeSettings').addEventListener('click', () => { saveSettings(); closeSettings(); });
$('saveSettings').addEventListener('click', () => { saveSettings(); closeSettings(); setStatus('Saved. Tap to talk'); });
$('ttsEngine').addEventListener('change', () => refreshVoiceField(true));
$('testVoice').addEventListener('click', () => { unlockAudio(); saveSettings(); speak('Hey Chase, it\'s Zhala. What do you need?'); });
$('clearKey').addEventListener('click', () => { LS.del('apiKey'); $('apiKey').value = ''; setStatus('Key removed'); });
$('clearChat').addEventListener('click', () => { history = []; LS.set('history', []); logEl.innerHTML = ''; greet(); });
$('version').textContent = 'Zhala v' + VERSION;

function updateBanner() {
  const b = $('banner');
  if (apiKey()) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = 'Zhala needs your Alibaba Model Studio key to think and talk in her Qwen voice. Time, weather, notes and team status work without it. <button id="bannerSet">Add key</button>';
  $('bannerSet').addEventListener('click', openSettings);
}
function greet() { addMsg('zhala', 'Hey Chase, it\'s Zhala. Tap the mic and talk to me.'); }

/* ---------------------------------------------------------------- boot */
for (const m of history.slice(-8)) addMsg(m.role === 'user' ? 'me' : 'zhala', m.content);
if (!history.length) greet();
updateBanner();
if (!SR) setStatus('Type below (voice input not available in this browser)');
if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; }
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e.message));
