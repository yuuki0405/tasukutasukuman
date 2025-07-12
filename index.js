// server.js
const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
require('dotenv').config();  // .env を読み込む (npm install dotenv)

// LINE Bot設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

// Supabaseクライアント初期化
const supabase = createClient(
  process.env.SUPABASE_URL,            // 例: https://xxx.supabase.co
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Expressアプリ作成
const app = express();

// JSON + rawBody 取得設定（LINE署名検証用）
app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

// LINE SDK クライアント
const client = new line.Client(config);

// ────────────────────────────────────────
// 共通：ユーザー初期登録（通知設定 & プロフィール）
// ────────────────────────────────────────
async function ensureUserRegistered(userId) {
  // 通知設定テーブル
  const { error: err1 } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, notify: true });
  if (err1) console.error('user_settings upsert error:', err1);

  // プロフィールテーブル
  const { error: err2 } = await supabase
    .from('user_profile')
    .upsert({
      user_id: userId,
      name: '',
      group: '',
      created_at: new Date()
    });
  if (err2) console.error('user_profile upsert error:', err2);
}

// ────────────────────────────────────────
// LINE Webhookエンドポイント
// ────────────────────────────────────────
app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;
  console.log('Received events:', events.length);

  for (const event of events) {
    // テキストメッセージ以外は無視
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text   = event.message.text.trim();
    console.log(`Webhook from ${userId}: "${text}"`);

    // ユーザー初期登録
    await ensureUserRegistered(userId);

    // 「タスク追加 ◯◯」
    if (text.startsWith('タスク追加 ')) {
      const taskContent = text.replace('タスク追加 ', '');
      const { error } = await supabase
        .from('todos')
        .insert({
          user_id: userId,
          task:    taskContent,
          status:  '未完了',
          date:    null,
          time:    null
        });
      const replyMsg = error
        ? 'タスクの追加に失敗しました。'
        : 'タスクを追加しました！';
      await client.replyMessage(event.replyToken, { type: 'text', text: replyMsg });

      // 通知設定を読み出し & 通知送信
      const { data: settings } = await supabase
        .from('user_settings')
        .select('notify')
        .eq('user_id', userId)
        .single();
      if (settings?.notify) {
        await client.pushMessage(userId, {
          type: 'text',
          text: `🆕 新しいタスク: ${taskContent}\n締切: 未定`
        });
      }
    }
    // 「進捗確認」
    else if (text === '進捗確認') {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });
      if (error) {
        console.error('Fetch todos error:', error);
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスクの取得中にエラーが発生しました。'
        });
        continue;
      }
      if (!data || data.length === 0) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '現在タスクは登録されていません。'
        });
      } else {
        const lines = data.map(t =>
          `✅ ${t.task} (${t.date || '未定'} ${t.time || ''}) - ${t.status}`
        );
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: lines.join('\n')
        });
      }
    }
    // その他のメッセージ
    else {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '「タスク追加 ○○」または「進捗確認」と送ってください。'
      });
    }
  }

  res.sendStatus(200);
});

// ────────────────────────────────────────
// Webアプリ：タスク追加エンドポイント
// ────────────────────────────────────────
app.post('/add-task', async (req, res) => {
  const { userId, task, deadline } = req.body;
  console.log('/add-task', { userId, task, deadline });

  if (!userId) {
    return res.status(400).json({ error: 'userIdが必要です' });
  }
  const [date, time] = (deadline || '').split(' ');

  // ユーザー初期登録
  await ensureUserRegistered(userId);

  // todosへ登録
  const { error } = await supabase
    .from('todos')
    .insert({
      user_id: userId,
      task,
      status: '未完了',
      date: date || null,
      time: time || null
    });
  if (error) {
    console.error('todos.insert error:', error);
    return res.status(500).json({ error: 'タスク登録に失敗しました' });
  }

  // 通知設定確認 → LINE通知
  const { data: settings } = await supabase
    .from('user_settings')
    .select('notify')
    .eq('user_id', userId)
    .single();
  if (settings?.notify) {
    await client.pushMessage(userId, {
      type: 'text',
      text: `🆕 タスク: ${task}\n締切: ${deadline || '未定'}`
    });
  }

  res.json({ success: true, message: 'タスクを追加しました！' });
});

// ────────────────────────────────────────
// Webアプリ：タスク取得エンドポイント
// ────────────────────────────────────────
app.get('/get-tasks', async (req, res) => {
  const userId = req.query.userId;
  console.log('/get-tasks userId=', userId);

  if (!userId) {
    return res.status(400).json({ error: 'userIdが必要です' });
  }
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });
  if (error) {
    console.error('todos.select error:', error);
    return res.status(500).json({ error: 'タスク取得に失敗しました' });
  }
  res.json({ tasks: data });
});

// ────────────────────────────────────────
// サーバー起動
// ────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
