const express = require('express');
const { Client, middleware } = require('@line/bot-sdk');
const db = require('./db');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new Client(config);
const app = express();

// webhookエンドポイント
app.post('/webhook', middleware(config), (req, res) => {
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result));
});

// LINE Bot イベントハンドラー
function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return Promise.resolve(null);
  }

  const userId = event.source.userId;
  const text = event.message.text;

  if (text.startsWith('タスク追加 ')) {
    const task = text.replace('タスク追加 ', '');
    return new Promise((resolve) => {
      db.run(
        "INSERT INTO tasks (userId, task, status) VALUES (?, ?, ?)",
        [userId, task, '未完了'],
        (err) => {
          const reply = err
            ? { type: 'text', text: 'タスクの追加に失敗しました。' }
            : { type: 'text', text: 'タスクを追加しました！' };
          resolve(client.replyMessage(event.replyToken, reply));
        }
      );
    });
  } else if (text === '進捗確認') {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT task, status FROM tasks WHERE userId = ?",
        [userId],
        (err, rows) => {
          if (err) return reject(err);

          const textMsg = rows.length === 0
            ? 'タスクはありません。'
            : rows.map(r => `${r.task} : ${r.status}`).join('\n');

          resolve(client.replyMessage(event.replyToken, {
            type: 'text',
            text: textMsg
          }));
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

// ポート起動
app.listen(3000, () => {
  console.log('Server running');
});
