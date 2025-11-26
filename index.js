// Firebase config (請自行填入你的 config)
const firebaseConfig = {
  apiKey: "AIzaSyAIkD6gi1o23hpaeIk7TDL5toKLpLwQdpQE",
  authDomain: "taillift-chatgpt.firebaseapp.com",
  databaseURL: "https://taillift-chatgpt-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "taillift-chatgpt",
  storageBucket: "taillift-chatgpt.appspot.com",
  messagingSenderId: "1041519254170",
  appId: "1:1041519254170:web:28f25f219f561aef3c1d23"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const storage = firebase.storage();

// UI
const msgArea = document.getElementById("msgArea");
const usersArea = document.getElementById("usersArea");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const voiceBtn = document.getElementById("voiceBtn");
const recordBtn = document.getElementById("recordBtn");

const username = "User_" + Math.floor(Math.random() * 10000);

// 使用者上線
const userRef = db.ref("online/" + username);
userRef.set({ online: true, time: Date.now() });
userRef.onDisconnect().remove();

// 顯示在線列表
db.ref("online").on("value", snap => {
  const users = snap.val() || {};
  usersArea.innerHTML = "<b>🟢 在線：</b><br>" +
      Object.keys(users).map(u => "・" + u).join("<br>");
});

// 翻譯 API
async function translate(text, targetLang) {
  const res = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
  );
  const data = await res.json();
  return data[0][0][0];
}

function detectLanguage(text) {
  if (/^[\x00-\x7F]+$/.test(text)) return "en";
  if (/[一-龥]/.test(text)) return "zh";
  return "other";
}

// 發送訊息
sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keypress", e => { if (e.key === "Enter") sendMessage(); });

async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;

  const lang = detectLanguage(text);
  let en = "";
  let zh = "";

  if (lang === "zh") {
    zh = text;
    en = await translate(text, "en");
  } else if (lang === "en") {
    en = text;
    zh = await translate(text, "zh-TW");
  } else {
    en = await translate(text, "en");
    zh = await translate(text, "zh-TW");
  }

  db.ref("messages").push({
    type: "text",
    user: username,
    original: text,
    en: en,
    zh: zh,
    time: Date.now()
  });

  msgInput.value = "";
}

// 接收訊息
db.ref("messages").on("child_added", snap => {
  appendMessage(snap.val());
});

function appendMessage(msg) {
  const div = document.createElement("div");
  div.classList.add("msg");
  div.classList.add(msg.user === username ? "self" : "other");

  if (msg.type === "audio") {
    div.innerHTML = `<b>${msg.user}</b><br>
      🎙 <audio controls src="${msg.audioURL}"></audio>`;
  } else {
    div.innerHTML = `
      <b>${msg.user}</b><br>
      ${msg.original}<br>
      <small>EN: ${msg.en}</small><br>
      <small>中文: ${msg.zh}</small><br>
      <button class="ttsBtn">🔊 播放語音</button>
    `;
  }

  msgArea.appendChild(div);
  msgArea.scrollTop = msgArea.scrollHeight;

  const btn = div.querySelector(".ttsBtn");
  if (btn) btn.addEventListener("click", () => ttsSpeak(msg.original, msg.en, msg.zh));
}

// TTS 語音播放
function ttsSpeak(original, en, zh) {
  const utter = new SpeechSynthesisUtterance();
  const lang = detectLanguage(original);

  utter.lang = lang === "en" ? "en-US" : "zh-TW";
  utter.text = lang === "en" ? zh : en;

  speechSynthesis.speak(utter);
}

// 語音輸入
let recognition;
if ("webkitSpeechRecognition" in window) {
  recognition = new webkitSpeechRecognition();
  recognition.lang = "zh-TW";
  recognition.onresult = e => msgInput.value = e.results[0][0].transcript;
}

voiceBtn.onclick = () => recognition && recognition.start();

// 錄音訊息
let mediaRecorder;
let chunks = [];

recordBtn.onclick = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = e => chunks.push(e.data);
  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: "audio/ogg" });
    chunks = [];

    const filename = `voice_${Date.now()}.ogg`;
    const ref = storage.ref(filename);
    await ref.put(blob);
    const url = await ref.getDownloadURL();

    db.ref("messages").push({
      type: "audio",
      user: username,
      audioURL: url,
      time: Date.now()
    });
  };

  mediaRecorder.start();
  setTimeout(() => mediaRecorder.stop(), 3000);
};
