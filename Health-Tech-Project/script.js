let score = 0;
function addScore() {
  score += 10;
  document.getElementById("score").innerText = "Score: " + score;
}
let time = 1500;
let total = 1500;
function startTimer() {
  let timer = setInterval(function () {
    let m = Math.floor(time / 60);
    let s = time % 60;
    if (s < 10) s = "0" + s;
    document.getElementById("time").innerText = m + ":" + s;
    let progress = ((total - time) / total) * 100;
    document.getElementById("progress").style.width = progress + "%";
    time--;
    if (time < 0) {
      clearInterval(timer);
      alert("Take a wellness break 🌿");
      time = total;
    }
  }, 1000);
}
function checkSymptom() {
  let s = document.getElementById("symptom").value.toLowerCase();
  let r = "";
  if (s.includes("fever") || s.includes("cough"))
    r = "You should consult a General Physician";
  else if (s.includes("skin")) r = "You should consult a Dermatologist";
  else if (s.includes("eye")) r = "You should consult an Ophthalmologist";
  else r = "Consult a General Physician";
  document.getElementById("result").innerText = r;
}
function showMap() {
  document.getElementById("map").style.display = "block";
}
function chat() {
  let input = document.getElementById("userInput").value.toLowerCase();
  let reply = "";
  if (input.includes("fever"))
    reply =
      "You might have a viral infection. Drink fluids and consult a doctor if fever persists.";
  else if (input.includes("headache"))
    reply = "Try rest and hydration. If severe, consult a neurologist.";
  else if (input.includes("cough"))
    reply = "It may be cold or infection. Monitor symptoms and consult doctor.";
  else reply = "Please describe your symptoms more clearly.";
  let chatbox = document.getElementById("chatbox");
  chatbox.innerHTML += "<p><b>You:</b> " + input + "</p>";
  chatbox.innerHTML += "<p><b>Doctor AI:</b> " + reply + "</p>";
  document.getElementById("userInput").value = "";
}
