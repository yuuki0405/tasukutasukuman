// ダミーログ
const logs = [
  "2025-05-28 10:20 - 「早くやれや！」",
  "2025-05-27 09:15 - 「お前まだやってないの？」",
  "2025-05-26 18:00 - 「まだ！？そんなんじゃダメだよ！」"
];

// ログ表示
const logList = document.getElementById("log-list");
logs.forEach(log => {
  const li = document.createElement("li");
  li.textContent = log;
  logList.appendChild(li);
});

// キャラクター表示
const charDisplay = document.getElementById("character-display");
const storedChar = localStorage.getItem("selectedCharacterName");
charDisplay.textContent = `通知キャラ：${storedChar || "未設定"}`;

// ユーザー名保存・読み込み
const usernameInput = document.getElementById("username");
const savedUsername = localStorage.getItem("username");
if (savedUsername) {
  usernameInput.value = savedUsername;
}

document.getElementById("save-user-btn").addEventListener("click", () => {
  const name = usernameInput.value.trim();
  if (name) {
    localStorage.setItem("username", name);
    alert("ユーザー名を保存しました！");
  } else {
    alert("ユーザー名を入力してください。");
  }
});



