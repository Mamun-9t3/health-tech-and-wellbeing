// ===== Mobile Menu Toggle =====
function toggleMenu() {
  var nav = document.getElementById("navLinks");
  if (nav) nav.classList.toggle("open");
}

// ===== Wellness Timer =====
var score = 0;
var time = 1500;
var total = 1500;
var timerInterval = null;
var timerRunning = false;

function addScore() {
  score += 10;
  var el = document.getElementById("score");
  if (el) el.innerText = score;
}

function updateTimerDisplay() {
  var m = Math.floor(time / 60);
  var s = time % 60;
  var display = m + ":" + (s < 10 ? "0" : "") + s;
  var el = document.getElementById("time");
  if (el) el.innerText = display;
  var bar = document.getElementById("progress");
  if (bar) bar.style.width = ((total - time) / total) * 100 + "%";
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerInterval = setInterval(function () {
    time--;
    updateTimerDisplay();
    if (time <= 0) {
      clearInterval(timerInterval);
      timerRunning = false;
      alert("Take a wellness break!");
      resetTimer();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
}

function resetTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  time = total;
  updateTimerDisplay();
}

// ===== Symptom Checker =====
function checkSymptom() {
  var s = document.getElementById("symptom").value.toLowerCase();
  var r = "";
  if (s.includes("fever") || s.includes("cough"))
    r = "You should consult a General Physician.";
  else if (s.includes("skin") || s.includes("rash"))
    r = "You should consult a Dermatologist.";
  else if (s.includes("eye"))
    r = "You should consult an Ophthalmologist.";
  else if (s.includes("headache") || s.includes("head"))
    r = "You should consult a Neurologist.";
  else if (s.includes("stomach") || s.includes("digestion"))
    r = "You should consult a Gastroenterologist.";
  else if (s.trim() === "")
    r = "Please enter your symptoms first.";
  else
    r = "Consult a General Physician for further evaluation.";
  document.getElementById("result").innerText = r;
}

function fillSymptom(text) {
  var input = document.getElementById("symptom");
  if (input) {
    input.value = text;
    // Do not auto-run the checker when filling a suggestion.
    // The user must press "Check" to see which specialist to consult.
  }
}

// ===== Hospital Map =====
function showMap() {
  var map = document.getElementById("map");
  if (map) {
    map.style.display = "block";
    var btn = document.getElementById("mapBtn");
    if (btn) btn.style.display = "none";
  }
}

// ===== Chatbot =====
function fillChatSymptom(text) {
  var input = document.getElementById("userInput");
  if (input) {
    input.value = text;
    input.focus();
  }
}

function chat() {
  var inputEl = document.getElementById("userInput");
  var input = inputEl.value.trim();
  if (!input) return;

  var chatbox = document.getElementById("chatbox");
  chatbox.innerHTML +=
    '<div class="chat-message user"><strong>You:</strong> ' + input + "</div>";

  var lower = input.toLowerCase();
  var reply = "";

  if (lower.includes("fever") || lower.includes("chills")) {
    reply =
      "A fever can mean your body is fighting an infection. Stay hydrated, rest, and use a fever reducer like paracetamol/acetaminophen as needed. If it stays above 102°F (39°C) or lasts more than a couple of days, please see a doctor.";
  } else if (lower.includes("cough")) {
    reply =
      "A cough can come from a cold, flu, or irritation. Try warm fluids, honey, and throat lozenges. If it lasts more than a week, you cough up blood, or you have trouble breathing, consult a physician.";
  } else if (lower.includes("headache")) {
    reply =
      "Headaches are common and can be caused by stress, dehydration, or lack of sleep. Rest, drink water, and consider an over-the-counter pain reliever. If it’s sudden and severe or comes with vision changes, seek medical attention.";
  } else if (lower.includes("stomach") || lower.includes("nausea")) {
    reply =
      "Stomach discomfort can be from indigestion, a virus, or food sensitivity. Try clear fluids, bland foods, and avoid fatty or spicy meals. If you have severe pain, blood in vomit/stool, or ongoing nausea, see a provider.";
  } else if (lower.includes("skin") || lower.includes("rash")) {
    reply =
      "Skin rashes can be due to allergies, irritation, or infection. Keep the area clean and avoid new products. If it spreads quickly, becomes painful, or you develop swelling, get evaluated by a dermatologist.";
  } else if (lower.includes("eye")) {
    reply =
      "Eye irritation could be from dryness, allergies, or infection. Avoid rubbing, use artificial tears, and see an eye doctor if you have pain, vision changes, or discharge.";
  } else {
    reply =
      "That sounds uncomfortable. Try to rest, stay hydrated, and monitor symptoms. If you feel worse or are unsure, please consult a healthcare professional.";
  }

  // show typing indicator for 5 seconds before replying
  chatbox.innerHTML +=
    '<div class="chat-message bot" id="typingIndicator"><strong>Doctor AI:</strong> Typing...</div>';
  chatbox.scrollTop = chatbox.scrollHeight;

  inputEl.value = "";
  inputEl.disabled = true;

  setTimeout(function () {
    var typingEl = document.getElementById("typingIndicator");
    if (typingEl) typingEl.remove();

    chatbox.innerHTML +=
      '<div class="chat-message bot"><strong>Doctor AI:</strong> ' + reply + "</div>";
    chatbox.scrollTop = chatbox.scrollHeight;
    inputEl.disabled = false;
    inputEl.focus();
  }, 5000);
}

// ===== Clinics / Doctor Search =====

const clinicData = [
  {
    name: "City General Hospital",
    address: "123 Main St",
    lat: 40.7128,
    lng: -74.006,
    specialties: ["General Physician", "Cardiologist", "Neurologist"],
  },
  {
    name: "Northside Medical Center",
    address: "450 Maple Ave",
    lat: 40.7215,
    lng: -74.0012,
    specialties: ["Dermatologist", "Pediatrician", "Ophthalmologist"],
  },
  {
    name: "Riverfront Wellness Clinic",
    address: "320 River Rd",
    lat: 40.7001,
    lng: -74.0142,
    specialties: ["General Physician", "Pediatrician"],
  },
  {
    name: "Downtown Neurology Center",
    address: "210 Health Plaza",
    lat: 40.7292,
    lng: -73.9965,
    specialties: ["Neurologist"],
  },
  {
    name: "EyeCare Specialists",
    address: "88 Vision Blvd",
    lat: 40.7182,
    lng: -74.0092,
    specialties: ["Ophthalmologist"],
  },
  {
    name: "West End Pediatrics",
    address: "14 West St",
    lat: 40.7139,
    lng: -74.0124,
    specialties: ["Pediatrician", "General Physician"],
  },
  {
    name: "Harbor Cardio Institute",
    address: "786 Harbor Dr",
    lat: 40.7223,
    lng: -74.0021,
    specialties: ["Cardiologist"],
  },
  {
    name: "Skin & Derm Care",
    address: "502 Madison Ave",
    lat: 40.7556,
    lng: -73.9808,
    specialties: ["Dermatologist"],
  },
  {
    name: "Vision Point Clinic",
    address: "220 Park Ave",
    lat: 40.7484,
    lng: -73.9857,
    specialties: ["Ophthalmologist"],
  },
  {
    name: "Family Health Partners",
    address: "95 Brook Lane",
    lat: 40.7301,
    lng: -73.9957,
    specialties: ["General Physician", "Pediatrician"],
  },
  {
    name: "NeuroCare Center",
    address: "121 Central Blvd",
    lat: 40.7327,
    lng: -73.9840,
    specialties: ["Neurologist"],
  },
];

function toMiles(km) {
  return km * 0.621371;
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findHospitals() {
  const status = document.getElementById("clinicsStatus");
  const results = document.getElementById("clinicResults");
  const specialty = document.getElementById("specialtySelect").value;

  if (!specialty) {
    status.textContent = "Please select a specialty to continue.";
    results.innerHTML = "";
    return;
  }

  if (!navigator.geolocation) {
    status.textContent =
      "Your browser doesn't support location access. Please enable location services.";
    results.innerHTML = "";
    return;
  }

  status.textContent = "Locating you...";
  results.innerHTML = "";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      status.textContent = "Finding nearby providers...";

      const matches = clinicData
        .filter((clinic) => clinic.specialties.includes(specialty))
        .map((clinic) => {
          const km = getDistanceKm(
            latitude,
            longitude,
            clinic.lat,
            clinic.lng
          );
          return { ...clinic, distance: toMiles(km) };
        })
        .sort((a, b) => a.distance - b.distance);

      if (matches.length === 0) {
        status.textContent =
          "No hospitals found for that specialty in our demo data.";
        return;
      }

      status.textContent = `Showing ${matches.length} results (sorted by closest).`;
      results.innerHTML = matches
        .map(
          (clinic) =>
            `<div class="clinic-card">
              <div class="clinic-info">
                <strong>${clinic.name}</strong>
                <div class="clinic-address">${clinic.address}</div>
                <div class="clinic-specialty">Specialty: ${specialty}</div>
              </div>
              <div class="clinic-meta">
                <div>${clinic.distance.toFixed(1)} mi</div>
                <a class="btn-secondary" target="_blank" rel="noopener"
                  href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    clinic.name
                  )}&query_place_id=&center=${clinic.lat},${clinic.lng}">
                  Open in Maps
                </a>
              </div>
            </div>`
        )
        .join("");
    },
    (err) => {
      status.textContent =
        "Unable to access location. Please allow location access and try again.";
      results.innerHTML = "";
    },
    { timeout: 10000 }
  );
}

// Automatically run when Clinics page loads
if (document.getElementById("specialtySelect")) {
  findHospitals();
}
