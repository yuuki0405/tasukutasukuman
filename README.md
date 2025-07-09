const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const db = require('./db');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new Client(config);
const app = express();

// JSONボディパーサーを追加
app.use(express.json());

// CORSを有効化（Webアプリからのアクセス用）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// LINE Botのwebhookエンドポイント
app.post('/webhook', middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result));
});

// Webアプリからのタスク追加エンドポイント
app.post('/add-task', async (req, res) => {
  try {
    const { task, userId, deadline } = req.body;
    
    if (!task) {
      return res.status(400).json({ error: 'タスク内容が必要です' });
    }

    // データベースにタスクを保存
    db.run(
      "INSERT INTO tasks (userId, task, status, deadline) VALUES (?, ?, ?, ?)",
      [userId || 'web-user', task, '未完了', deadline || null],
      function(err) {
        if (err) {
          console.error('データベースエラー:', err);
          return res.status(500).json({ error: 'タスクの保存に失敗しました' });
        }
        
        console.log(`タスクが追加されました: ${task}`);
        res.json({ success: true, message: 'タスクを追加しました' });
      }
    );
  } catch (error) {
    console.error('タスク追加エラー:', error);
    res.status(500).json({ error: 'サーバーエラー' });
  }
});

// Webアプリからのタスク取得エンドポイント
app.get('/get-tasks', (req, res) => {
  const userId = req.query.userId || 'web-user';
  
  db.all(
    "SELECT task, status, deadline FROM tasks WHERE userId = ? ORDER BY id DESC",
    [userId],
    (err, rows) => {
      if (err) {
        console.error('データベースエラー:', err);
        return res.status(500).json({ error: 'タスクの取得に失敗しました' });
      }
      
      res.json({ tasks: rows });
    }
  );
});

// LINE Botのイベントハンドラー
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const text = event.message.text;

  if (text.startsWith('タスク追加 ')) {
    const task = text.replace('タスク追加 ', '');
    db.run(
      "INSERT INTO tasks (userId, task, status) VALUES (?, ?, ?)",
      [userId, task, '未完了'],
      function(err) {
        if (err) {
          console.error('データベースエラー:', err);
          return client.replyMessage(event.replyToken, {
            type: 'text',
            text: 'タスクの追加に失敗しました。'
          });
        }
        
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスクを追加しました！'
        });
      }
    );
  } else if (text === '進捗確認') {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT task, status FROM tasks WHERE userId = ? ORDER BY id DESC",
        [userId],
        (err, rows) => {
          if (err) {
            return reject(err);
          }
          
          if (rows.length === 0) {
            resolve(client.replyMessage(event.replyToken, {
              type: 'text',
              text: 'タスクはありません。'
            }));
          } else {
            const msg = rows.map(r => `${r.task} : ${r.status}`).join('\n');
            resolve(client.replyMessage(event.replyToken, {
              type: 'text',
              text: msg
            }));
          }
        }
      );
    });
  } else {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: '「タスク追加 ○○」または「進捗確認」と送信してください。'
    });
  }
}

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
