// ===== Mobile Menu Toggle =====
function toggleMenu() {
  var nav = document.getElementById('navLinks');
  if (nav) nav.classList.toggle('open');
}

// ===== Navbar: show logged-in user =====
(function initNavUser() {
  fetch('/api/me', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(user => {
      var signIn  = document.querySelector('a[href="login.html"].btn-primary');
      var signUp  = document.querySelector('a[href="register.html"].btn-secondary');
      var navList = document.getElementById('navLinks');

      if (user && navList) {
        if (signIn) signIn.parentElement.remove();
        if (signUp) signUp.parentElement.remove();

        var li = document.createElement('li');
        li.innerHTML =
          '<span style="color:#4f9cf9;font-weight:600;padding:8px 12px;">👤 ' + user.username + '</span>';
        navList.appendChild(li);

        var li2 = document.createElement('li');
        li2.innerHTML = '<a href="#" class="btn-secondary" id="logoutBtn">Logout</a>';
        navList.appendChild(li2);

        document.addEventListener('click', function (e) {
          if (e.target && e.target.id === 'logoutBtn') {
            e.preventDefault();
            localStorage.removeItem('hc_dashboardState');
            fetch('/api/logout', { method: 'POST', credentials: 'include' })
              .then(() => window.location.href = 'login.html');
          }
        });
      }
    })
    .catch(() => {});
})();

// ===== Wellness Timer =====
let timerMode = 'focus';
let time = 1500;
let total = 1500;
let timerInterval = null;
let timerRunning = false;
let sessionStartTime = null;

function setTimerMode(mode) {
  if (timerRunning) return; // Prevent changing mode while running
  timerMode = mode;
  
  // Toggle UI buttons
  const focusBtn = document.getElementById('focusToggle');
  const breakBtn = document.getElementById('breakToggle');
  if (focusBtn) focusBtn.classList.remove('active');
  if (breakBtn) breakBtn.classList.remove('active');
  
  if (mode === 'focus') {
    if (focusBtn) focusBtn.classList.add('active');
    time = 1500;
    total = 1500;
  } else {
    if (breakBtn) breakBtn.classList.add('active');
    time = 300;
    total = 300;
  }
  updateTimerDisplay();
}

function updateTimerDisplay() {
  let m = Math.floor(time / 60);
  let s = time % 60;
  let display = m + ':' + (s < 10 ? '0' : '') + s;
  let el = document.getElementById('time');
  if (el) el.innerText = display;
}

function toggleTimer() {
  let btn = document.getElementById('startBtn');
  if (timerRunning) {
    // Pause
    clearInterval(timerInterval);
    timerRunning = false;
    if (btn) btn.innerText = 'START';
  } else {
    // Start
    timerRunning = true;
    sessionStartTime = Date.now();
    if (btn) btn.innerText = 'PAUSE';
    
    timerInterval = setInterval(function () {
      time--;
      updateTimerDisplay();
      if (time <= 0) {
        clearInterval(timerInterval);
        timerRunning = false;
        if (btn) btn.innerText = 'START';
        
        let elapsed = Math.round((Date.now() - sessionStartTime) / 1000);
        logWellnessSession(elapsed, true);
        
        if (timerMode === 'focus') {
          showToast('Focus session complete!', 'success');
          // Automatically log the completed session
          if (typeof logFocusSession === 'function') logFocusSession();
        } else {
          showToast('Break complete! Back to work.', 'info');
        }
        
        // Auto-switch modes
        setTimerMode(timerMode === 'focus' ? 'break' : 'focus');
      }
    }, 1000);
  }
}

function resetTimer() {
  if (timerRunning && sessionStartTime) {
    let elapsed = Math.round((Date.now() - sessionStartTime) / 1000);
    if (elapsed > 10) logWellnessSession(elapsed, false);
  }
  clearInterval(timerInterval);
  timerRunning = false;
  sessionStartTime = null;
  time = total;
  updateTimerDisplay();
  
  let btn = document.getElementById('startBtn');
  if (btn) btn.innerText = 'START';
}

function logWellnessSession(duration_seconds, completed) {
  fetch('/api/wellness/log', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration_seconds, completed }),
  }).catch(() => {});
}

// ===== Symptom Checker (Gemini-powered) =====

/** Convert markdown to HTML for AI replies */
function markdownToHtml(text) {
  // Escape raw HTML first (XSS protection)
  var safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return safe
    // Bold+Italic: ***text***
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    // Bold: **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic: *text* (single asterisk, NOT followed by space = not a bullet)
    .replace(/\*(?! )(.+?)(?<! )\*/g, '<em>$1</em>')
    // Bullet lines: only "- item" (dash-space) to avoid clashing with *italic*
    .replace(/^[ \t]*- (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> runs in a single <ul>
    .replace(/(<li>.*<\/li>)(\n<li>.*<\/li>)*/g, (m) =>
      '<ul style="margin:8px 0 8px 18px;padding:0;list-style:disc;">' + m + '</ul>'
    )
    // Remove seams between adjacent </ul><ul>
    .replace(/<\/ul>\n?<ul[^>]*>/g, '')
    // Remaining newlines → line breaks
    .replace(/\n/g, '<br>');
}


function checkSymptom() {
  var inputEl  = document.getElementById('symptom');
  var resultEl = document.getElementById('result');
  var cardEl   = document.getElementById('resultCard');
  var symptom  = inputEl ? inputEl.value.trim() : '';

  if (!symptom) {
    if (resultEl) resultEl.innerText = 'Please enter your symptoms first.';
    if (cardEl)   cardEl.style.display = 'block';
    return;
  }

  if (resultEl) resultEl.innerHTML = '<em style="color:#6b7280;">🔍 Analysing your symptoms...</em>';
  if (cardEl)   cardEl.style.display = 'block';

  fetch('/api/symptoms/check', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ symptom }),
  })
    .then(r => r.json())
    .then(data => {
      var text = data.recommendation || data.error || 'Unable to analyse symptoms.';
      if (resultEl) resultEl.innerHTML = markdownToHtml(text);
    })
    .catch(() => {
      if (resultEl) resultEl.innerHTML = markdownToHtml(localSymptomCheck(symptom));
    });
}

function localSymptomCheck(s) {
  var lower = s.toLowerCase();
  if (lower.includes('fever') || lower.includes('cough'))  return 'Consult a General Physician.';
  if (lower.includes('skin')  || lower.includes('rash'))   return 'Consult a Dermatologist.';
  if (lower.includes('eye'))                               return 'Consult an Ophthalmologist.';
  if (lower.includes('headache') || lower.includes('head')) return 'Consult a Neurologist.';
  if (lower.includes('stomach') || lower.includes('digestion')) return 'Consult a Gastroenterologist.';
  return 'Consult a General Physician for further evaluation.';
}

function fillSymptom(text) {
  var input = document.getElementById('symptom');
  if (input) input.value = text;
}

// ===== Hospital Map =====
function showMap() {
  var map = document.getElementById('map');
  if (map) {
    map.style.display = 'block';
    var btn = document.getElementById('mapBtn');
    if (btn) btn.style.display = 'none';
  }
}

// ===== Chatbot (Gemini-powered) with session sidebar =====
var chatHistory   = [];   // [{role:'user'|'model', parts:[{text}]}]
var currentSessionId = generateSessionId();

function generateSessionId() {
  return 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function fillChatSymptom(text) {
  var input = document.getElementById('userInput');
  if (input) { input.value = text; input.focus(); }
}

// ── Start a fresh chat ──────────────────────────────────────────────
function startNewChat() {
  currentSessionId = generateSessionId();
  chatHistory = [];
  var chatbox = document.getElementById('chatbox');
  if (chatbox) {
    chatbox.innerHTML =
      '<div class="chat-message bot"><strong>Doctor AI</strong>Hello! Describe your symptoms and I\'ll try to help.</div>';
  }
  // Deselect sidebar items
  document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
}

// ── Load sidebar session list ───────────────────────────────────────
function loadSessionList() {
  fetch('/api/chat/sessions', { credentials: 'include' })
    .then(r => r.ok ? r.json() : [])
    .then(sessions => {
      var list = document.getElementById('sessionList');
      if (!list) return;

      if (!sessions || sessions.length === 0) {
        list.innerHTML = '<span style="color:#cbd5e1;font-size:0.82rem;padding:4px;">No conversations yet</span>';
        return;
      }

      list.innerHTML = sessions.map(s => {
        var preview = (s.first_message || '').slice(0, 28) + (s.first_message && s.first_message.length > 28 ? '...' : '');
        return `<div class="session-item" data-id="${s.session_id}" onclick="loadSession('${s.session_id}', this)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          ${escapeHtml(preview)}
        </div>`;
      }).join('');
    })
    .catch(() => {});
}

// ── Load a past session into the chatbox ────────────────────────────
function loadSession(sessionId, el) {
  currentSessionId = sessionId;
  chatHistory = [];

  document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');

  fetch('/api/chat/session/' + sessionId, { credentials: 'include' })
    .then(r => r.json())
    .then(messages => {
      var chatbox = document.getElementById('chatbox');
      if (!chatbox) return;

      if (!messages || messages.length === 0) {
        chatbox.innerHTML = '<div class="chat-message bot"><strong>Doctor AI</strong>No messages in this session.</div>';
        return;
      }

      chatbox.innerHTML = messages.map(m => {
        if (m.role === 'user') {
          chatHistory.push({ role: 'user',  parts: [{ text: m.message }] });
          return `<div class="chat-message user"><strong>You</strong>${escapeHtml(m.message)}</div>`;
        } else {
          chatHistory.push({ role: 'model', parts: [{ text: m.message }] });
          return `<div class="chat-message bot"><strong>Doctor AI</strong>${markdownToHtml(m.message)}</div>`;
        }
      }).join('');
      chatbox.scrollTop = chatbox.scrollHeight;
    })
    .catch(() => {});
}

// ── Send a message ──────────────────────────────────────────────────
function chat() {
  var inputEl = document.getElementById('userInput');
  var sendBtn = document.getElementById('sendBtn');
  var input   = inputEl ? inputEl.value.trim() : '';
  if (!input) return;

  var chatbox = document.getElementById('chatbox');
  chatbox.innerHTML += `<div class="chat-message user"><strong>You</strong>${escapeHtml(input)}</div>`;
  chatbox.innerHTML += `<div class="chat-message bot" id="typingIndicator"><strong>Doctor AI</strong><em>Typing...</em></div>`;
  chatbox.scrollTop  = chatbox.scrollHeight;

  inputEl.value    = '';
  inputEl.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  fetch('/api/chat/save', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ message: input, history: chatHistory, session_id: currentSessionId }),
  })
    .then(r => r.json())
    .then(data => {
      var typingEl = document.getElementById('typingIndicator');
      if (typingEl) typingEl.remove();

      if (data.error) {
        // Just display error without appending it to the real history
        chatbox.innerHTML += `<div class="chat-message bot"><strong>Doctor AI</strong><span style="color:#ef4444;">${escapeHtml(data.error)}</span></div>`;
      } else {
        var reply = data.reply || 'Sorry, I could not respond.';
        chatHistory.push({ role: 'user',  parts: [{ text: input }] });
        chatHistory.push({ role: 'model', parts: [{ text: reply }] });
        chatbox.innerHTML += `<div class="chat-message bot"><strong>Doctor AI</strong>${markdownToHtml(reply)}</div>`;
        
        // Urgent local check
        var urgent = getUrgentAdvice(input);
        if (urgent) {
           displayBotSuggestion(urgent, null, []);
        }

        // Doctor specialty check & hospital fetching
        var doctor = getDoctorSpecialty(input);
        if (doctor !== 'General Physician' || input.toLowerCase().includes('doctor') || input.toLowerCase().includes('hospital')) {
          var suggestionText = `Based on what you described, it may be helpful to consult a ${doctor}. Detecting nearby facilities...`;
          var loadingId = 'loading-' + Date.now();
          chatbox.innerHTML += `<div class="chat-message bot" id="${loadingId}"><strong>Doctor AI (Action)</strong><div style="background:#f1f5f9; border-radius:8px; padding:10px; margin-top:8px; font-size:0.9rem; color:#475569;">${suggestionText}</div></div>`;
          chatbox.scrollTop = chatbox.scrollHeight;

          getNearestHospitalDataForChat(doctor).then(res => {
            var el = document.getElementById(loadingId);
            if (el) el.remove();
            displayBotSuggestion(`I found some nearby facilities that might help you connect with a ${doctor}:`, res.mapLink, res.hospitals);
          });
        }

        // Refresh sidebar after first message of a session
        if (chatHistory.length === 2) loadSessionList();
      }

      chatbox.scrollTop  = chatbox.scrollHeight;
      inputEl.disabled   = false;
      if (sendBtn) sendBtn.disabled = false;
      inputEl.focus();
    })
    .catch(() => {
      var typingEl = document.getElementById('typingIndicator');
      if (typingEl) typingEl.remove();
      chatbox.innerHTML += `<div class="chat-message bot"><strong>Doctor AI</strong><span style="color:#ef4444;">Unable to connect. Please ensure you are logged in.</span></div>`;
      chatbox.scrollTop  = chatbox.scrollHeight;
      inputEl.disabled   = false;
      if (sendBtn) sendBtn.disabled = false;
    });
}




function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// Allow Enter key to send chat
document.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'userInput') {
    e.preventDefault();
    chat();
  }
});

// ===== Clinics / Doctor Search — client-side filtered =====
var allHospitals = [];   // cache all fetched hospitals
var userLatLon   = null; // { lat, lon }

function filterAndRender() {
  const specialty = document.getElementById('specialtySelect')
    ? document.getElementById('specialtySelect').value
    : 'all';
  const status  = document.getElementById('clinicsStatus');
  const results = document.getElementById('clinicResults');

  const filtered = allHospitals.filter(h => {
    if (specialty === 'all') return true;
    const t = h.specialtyTags || '';
    if (specialty === 'cardiac')   return t.includes('cardi') || t.includes('heart');
    if (specialty === 'neuro')     return t.includes('neuro') || t.includes('brain');
    if (specialty === 'derma')     return t.includes('derma') || t.includes('skin');
    if (specialty === 'pediatric') return t.includes('pediatr') || t.includes('paediatr') || t.includes('child') || t.includes('shishu');
    if (specialty === 'ortho')     return t.includes('ortho') || t.includes('bone');
    if (specialty === 'dental')    return t.includes('dent') || t.includes('tooth') || t.includes('teeth');
    if (specialty === 'eye')       return t.includes('eye') || t.includes('ophthal') || t.includes('vision');
    if (specialty === 'gynae')     return t.includes('gyn') || t.includes('women') || t.includes('matern');
    return true;
  });

  if (filtered.length === 0) {
    if (status) status.textContent = allHospitals.length > 0
      ? 'No facilities found for this specialty within 10 km. Try "General / All Facilities".'
      : 'No hospitals found near you.';
    if (results) results.innerHTML = '';
    return;
  }

  if (status) status.textContent =
    `Showing ${filtered.length} result${filtered.length > 1 ? 's' : ''} near you (sorted by closest).`;

  if (results) {
    results.innerHTML = filtered.map(p => {
      const mapsDir = userLatLon
        ? `https://www.google.com/maps/dir/?api=1&origin=${userLatLon.lat},${userLatLon.lon}&destination=${p.lat},${p.lon}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}`;
      return `
        <div class="clinic-card">
          <div class="clinic-info">
            <strong>${escapeHtml(p.name)}</strong>
            <div class="clinic-address">${p.address ? escapeHtml(p.address) : 'Address not available'}</div>
            <div class="clinic-specialty">${escapeHtml((p.type || 'clinic').replace('_',' '))} — ${p.dist.toFixed(1)} km away</div>
          </div>
          <div class="clinic-meta">
            <a class="btn-primary" target="_blank" rel="noopener" href="${mapsDir}"
               style="font-size:0.85rem;padding:10px 16px;">
              🗺️ Get Directions
            </a>
          </div>
        </div>`;
    }).join('');
  }
}

function findHospitals() {
  const status  = document.getElementById('clinicsStatus');
  const results = document.getElementById('clinicResults');

  if (!navigator.geolocation) {
    if (status) status.textContent = "Your browser doesn't support location access.";
    return;
  }

  if (status) status.innerHTML = '📍 Locating you...';
  if (results) results.innerHTML = '';
  allHospitals = [];

  navigator.geolocation.getCurrentPosition(
    async position => {
      userLatLon = { lat: position.coords.latitude, lon: position.coords.longitude };
      if (status) status.innerHTML = '🔍 Searching nearby hospitals...';

      try {
        const params = new URLSearchParams({ lat: userLatLon.lat, lon: userLatLon.lon });
        const resp   = await fetch('/api/hospitals?' + params);
        const data   = await resp.json();

        if (!resp.ok) {
          if (status) status.textContent = data.error || 'Failed to load hospital data.';
          return;
        }

        allHospitals = data;
        filterAndRender();
      } catch (err) {
        console.error('Hospital fetch error:', err);
        if (status) status.textContent = 'Failed to load data. Check your connection and try again.';
      }
    },
    () => {
      if (status) status.textContent = 'Location access denied. Please allow location access and try again.';
    },
    { timeout: 12000, enableHighAccuracy: true }
  );
}

// Re-filter instantly when dropdown changes (no new API call)
document.addEventListener('change', function(e) {
  if (e.target && e.target.id === 'specialtySelect' && allHospitals.length > 0) {
    filterAndRender();
  }
});

// ===== Inline Chat Helpers (Reference code integration) =====

function getDoctorSpecialty(input) {
  var text = input.toLowerCase();
  if (text.includes("fever") || text.includes("cough") || text.includes("cold") || text.includes("flu")) return "General Physician";
  if (text.includes("skin") || text.includes("rash") || text.includes("acne")) return "Dermatologist";
  if (text.includes("eye") || text.includes("vision") || text.includes("blur")) return "Ophthalmologist";
  if (text.includes("headache") || text.includes("migraine")) return "Neurologist";
  if (text.includes("stomach") || text.includes("nausea") || text.includes("diarrhea") || text.includes("digest")) return "Gastroenterologist";
  if (text.includes("chest") || text.includes("heart") || text.includes("palpitations") || text.includes("breath")) return "Cardiologist";
  if (text.includes("bone") || text.includes("joint") || text.includes("muscle") || text.includes("fracture")) return "Orthopedist";
  return "General Physician";
}

function getUrgentAdvice(input) {
  var text = input.toLowerCase();
  var severeKeywords = ["severe", "worsening", "intense", "very bad", "can't breathe", "shortness of breath", "chest pain", "blood", "unconscious", "confusion", "stroke"];
  var found = severeKeywords.some((kw) => text.includes(kw));
  if (found) {
    return "If your pain is severe or symptoms are rapidly worsening, please call emergency services right away.";
  }
  return null;
}

function displayBotSuggestion(text, mapLink, hospitals) {
  var chatbox = document.getElementById('chatbox');
  if (!chatbox) return;

  var isEmergency = text.toLowerCase().includes("call") && text.toLowerCase().includes("emergency");
  var styleAttr = isEmergency 
    ? ' style="border:1.5px solid rgba(239, 68, 68, 0.5); background:rgba(254, 242, 242, 0.8); border-radius:8px; padding:12px; margin-top:8px; color:#991b1b;"' 
    : ' style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-top:8px; color:#334155; font-size:0.95rem;"';
  
  var html = '<div class="chat-message bot"><strong>Doctor AI (Action)</strong><div' + styleAttr + '><p style="margin:0 0 8px 0; font-weight:500;">' + escapeHtml(text) + '</p>';
  
  if (hospitals && hospitals.length > 0) {
    html += '<ul style="margin:0; padding-left:22px; font-size:0.85rem; line-height:1.6;">';
    hospitals.forEach(function(h, index) {
      var gmapsLink = 'https://www.google.com/maps/dir/?api=1&destination=' + h.lat + ',' + h.lon;
      html += '<li style="margin-bottom:6px;"><a href="' + gmapsLink + '" target="_blank" rel="noopener noreferrer" style="color:#0ea5e9; text-decoration:none; font-weight:600;">' + escapeHtml(h.name) + '</a><span style="display:block; font-size:0.75rem; color:#64748b;">' + (index === 0 ? '<strong style="color:#10b981;">(Closest)</strong> ' : '') + h.dist.toFixed(1) + ' km away</span></li>';
    });
    html += '</ul>';
  } else if (mapLink && !isEmergency) {
    html += '<div style="font-size:0.85rem; color:#64748b; margin-bottom:8px;">Finding specific local clinics nearby...</div>';
  }
  
  if (mapLink) {
    html += '<a href="' + mapLink + '" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:8px; font-size:0.85rem; color:#2563eb; font-weight:600; background:#f1f5f9; padding:6px 10px; border-radius:6px; text-decoration:none;">🌍 View all on Google Maps</a>';
  }
  
  html += '</div></div>';
  chatbox.innerHTML += html;
  chatbox.scrollTop = chatbox.scrollHeight;
}

async function getNearestHospitalDataForChat(doctorSpecialty) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ mapLink: "https://www.google.com/maps/search/hospital+near+me", hospitals: [] });
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      var lat = pos.coords.latitude;
      var lon = pos.coords.longitude;
      var mapLink = 'https://www.google.com/maps/search/' + encodeURIComponent(doctorSpecialty + ' hospital near me') + '/@' + lat + ',' + lon + ',14z';
      try {
        var resp = await fetch('/api/hospitals?lat=' + lat + '&lon=' + lon);
        if (!resp.ok) return resolve({ mapLink: mapLink, hospitals: [] });
        var data = await resp.json();
        
        var filtered = data;
        var s = doctorSpecialty.toLowerCase();
        if (s.includes('cardio')) filtered = data.filter(h => (h.specialtyTags||'').includes('cardi') || (h.specialtyTags||'').includes('heart'));
        else if (s.includes('neuro')) filtered = data.filter(h => (h.specialtyTags||'').includes('neuro') || (h.specialtyTags||'').includes('brain'));
        else if (s.includes('derma')) filtered = data.filter(h => (h.specialtyTags||'').includes('derma') || (h.specialtyTags||'').includes('skin'));
        else if (s.includes('ophthal')) filtered = data.filter(h => (h.specialtyTags||'').includes('eye') || (h.specialtyTags||'').includes('ophthal'));
        else if (s.includes('gastro')) filtered = data.filter(h => (h.specialtyTags||'').includes('gastro') || (h.specialtyTags||'').includes('digest') || (h.specialtyTags||'').includes('stomach'));
        else if (s.includes('ortho')) filtered = data.filter(h => (h.specialtyTags||'').includes('ortho') || (h.specialtyTags||'').includes('bone'));
        
        resolve({ mapLink: mapLink, hospitals: filtered.slice(0, 3) });
      } catch(e) {
        resolve({ mapLink: mapLink, hospitals: [] });
      }
    }, () => {
      resolve({ mapLink: "https://www.google.com/maps/search/hospital+near+me", hospitals: [] });
    }, { timeout: 6000 });
  });
}

// Note: findHospitals() is triggered manually by the Find Nearby button only
// ===== Homepage Dashboard Logging & Toasts =====
let dashboardState = JSON.parse(localStorage.getItem('hc_dashboardState')) || {
  wellness: 0,
  hydration: 0,
  activeMins: 0,
  focusMins: 0
};

async function loadDashboardState() {
  try {
    const res = await fetch('/api/dashboard', { credentials: 'include' });
    if (res.ok) {
      dashboardState = await res.json();
      localStorage.setItem('hc_dashboardState', JSON.stringify(dashboardState));
      updateDashboardDisplay();
    }
  } catch (err) {}
}

async function saveDashboardState() {
  localStorage.setItem('hc_dashboardState', JSON.stringify(dashboardState));
  try {
    await fetch('/api/dashboard', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dashboardState)
    });
  } catch (err) {}
}

function updateDashboardDisplay() {
  // Homepage displays
  const w = document.getElementById('wellnessScoreDisplay');
  const h = document.getElementById('hydrationAmountDisplay');
  const a = document.getElementById('activeMinutesDisplay');
  if (w) w.innerText = dashboardState.wellness;
  if (h) h.innerText = dashboardState.hydration;
  if (a) a.innerText = dashboardState.activeMins;
  
  // Wellness page quick logs
  const qlH = document.getElementById('qlHydrationStatus');
  const qlS = document.getElementById('qlStretchStatus');
  const qlF = document.getElementById('qlFocusStatus');
  if (qlH) qlH.innerText = 'Today: ' + dashboardState.hydration + ' ml';
  if (qlS) qlS.innerText = 'Today: ' + dashboardState.activeMins + ' mins';
  if (qlF) qlF.innerText = 'Today: ' + dashboardState.focusMins + ' mins';
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = type === 'success' ? '✅' : 'ℹ️';
  toast.innerHTML = `<span>${icon} ${message}</span>`;
  
  container.appendChild(toast);

  // Remove toast after animation finishes (3s total: 0.3s in + 2.7s out)
  setTimeout(() => {
    if (container.contains(toast)) {
      container.removeChild(toast);
    }
  }, 3000);
}

function logHydration() {
  dashboardState.hydration += 250;
  dashboardState.wellness += 2;
  if (dashboardState.wellness > 100) dashboardState.wellness = 100;
  saveDashboardState();
  updateDashboardDisplay();
  showToast('Logged 250ml of water!', 'info');
}

function logActivity() {
  dashboardState.activeMins += 15;
  dashboardState.wellness += 5;
  if (dashboardState.wellness > 100) dashboardState.wellness = 100;
  saveDashboardState();
  updateDashboardDisplay();
  showToast('Logged 15m stretch session!', 'success');
}

function logFocusSession() {
  dashboardState.focusMins += 25;
  dashboardState.wellness += 10;
  if (dashboardState.wellness > 100) dashboardState.wellness = 100;
  saveDashboardState();
  updateDashboardDisplay();
  showToast('Logged 25m Focus Session!', 'success');
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  updateDashboardDisplay();
  loadDashboardState();
});
