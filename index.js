// 入力欄やリストの要素を取得
const taskInput = document.getElementById('taskInput');   // タスク内容入力欄
const dateInput = document.getElementById('dateInput');   // 日付入力欄
const timeInput = document.getElementById('timeInput');   // 時間入力欄
const taskList = document.getElementById('taskList');     // タスクリスト表示エリア
let tasks = []; // タスクを格納する配列

// LINE BotサーバーのURL（環境に応じて変更）
const LINE_BOT_URL = 'http://localhost:3000'; // ローカル開発時
// const LINE_BOT_URL = 'https://your-app-name.onrender.com'; // Renderデプロイ時

// ページ読み込み時の処理
window.onload = () => {
  // 通知の許可をリクエスト（初回のみ）
  if (Notification.permission !== "granted") {
    Notification.requestPermission();
  }

  // ローカルストレージからタスクを取得
  const saved = localStorage.getItem('tasks');
  if (saved) {
    tasks = JSON.parse(saved); // 文字列→配列に変換
    renderTasks(); // タスクを画面に表示
  }
};

// タスク配列をローカルストレージに保存
function saveTasks() {
  localStorage.setItem('tasks', JSON.stringify(tasks));
}

// LINE Botサーバーにタスクを送信する関数
async function sendTaskToLineBot(taskContent) {
  try {
    const response = await fetch(`${LINE_BOT_URL}/add-task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: taskContent,
        userId: 'web-user', // Webアプリからの送信を識別
        deadline: `${dateInput.value} ${timeInput.value}`
      })
    });
    
    if (response.ok) {
      console.log('タスクがLINE Botに送信されました');
      return true;
    } else {
      console.error('LINE Botへの送信に失敗しました');
      return false;
    }
  } catch (error) {
    console.error('LINE Botとの通信エラー:', error);
    return false;
  }
}

// タスクを追加する関数（ボタン押下時に呼ばれる）
async function addTask() {
  const content = taskInput.value.trim(); // タスク内容
  const date = dateInput.value;           // 日付
  const time = timeInput.value;           // 時間

  // 入力チェック
  if (!content || !date || !time) {
    alert("すべての項目を入力してください。");
    return;
  }

  // 締切日時を作成
  const deadlineStr = `${date} ${time}`;
  const deadline = new Date(deadlineStr);

  // タスクオブジェクトを作成
  const task = {
    id: Date.now(),      // 一意なID（現在時刻）
    content,             // タスク内容
    deadline: deadlineStr // 締切日時（文字列）
  };

  tasks.unshift(task); // 配列の先頭に追加
  saveTasks();         // 保存
  renderTasks();       // 画面更新

  // LINE Botにもタスクを送信
  const lineBotSuccess = await sendTaskToLineBot(content);
  if (lineBotSuccess) {
    alert('タスクを追加しました！LINE Botでも確認できます。');
  } else {
    alert('タスクを追加しました！（LINE Botとの連携に失敗しました）');
  }

  // 入力欄をリセット
  taskInput.value = '';
  dateInput.value = '';
  timeInput.value = '';

  // 締切5分前に通知を予約
  const now = new Date();
  const notifyTime = new Date(deadline.getTime() - 5 * 60 * 1000); // 5分前
  const timeout = notifyTime - now;

  // まだ締切5分前を過ぎていなければ通知をセット
  if (timeout > 0) {
    setTimeout(() => sendNotification(task), timeout);
  }
}

// タスクを削除する関数
function deleteTask(id) {
  tasks = tasks.filter(task => task.id !== id); // 指定ID以外で再構成
  saveTasks(); // 保存
  renderTasks(); // 画面更新
}

// タスク一覧を画面に描画する関数
function renderTasks() {
  taskList.innerHTML = ''; // 一旦クリア
  tasks.forEach(task => {
    // タスク表示用のdivを作成
    const div = document.createElement('div');
    div.className = 'task';
    div.innerHTML = `
      <div class="task-content">
        <strong>${task.content}</strong>
        <small>締切: ${task.deadline}</small>
      </div>
      <button class="delete" onclick="deleteTask(${task.id})">削除</button>
    `;
    taskList.appendChild(div); // リストに追加
  });
}

// 通知を送る関数
function sendNotification(task) {
  // 通知許可がある場合のみ実行
  if (Notification.permission === "granted") {
    new Notification("⏰ タスクの時間です！", {
      body: `${task.content}（締切: ${task.deadline}）`,
      icon: "icon.png" // 任意：通知に表示するアイコン画像
    });
  }
}

// LINE Botからタスク一覧を取得する関数（オプション）
async function getTasksFromLineBot() {
  try {
    const response = await fetch(`${LINE_BOT_URL}/get-tasks`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('LINE Botからタスクを取得:', data);
      return data;
    }
  } catch (error) {
    console.error('LINE Botからの取得エラー:', error);
  }
  return null;
}
