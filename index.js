// index.js
require('dotenv').config();  // ① dotenv を最初に読み込む

const express = require('express');
const line   = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');

// ② LINE Bot 設定（.env から読み込む）
const lineConfig = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret:       process.env.CHANNEL_SECRET
};
const lineClient = new line.Client(lineConfig);

// ③ Supabase クライアント初期化（.env から読み込む）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();

// ④ JSON + rawBody 取得（LINE 署名検証用）
app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

// ─────────────────────────────────────
// 共通：ユーザー情報を upsert する
//    ・user_settings (notify:true)
//    ・user_profile  (name, group, created_at)
// ─────────────────────────────────────
async function ensureUserRegistered(userId) {
  // 通知設定
  const { error: err1 } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, notify: true });
  if (err1) console.error('user_settings upsert error:', err1);

  // プロフィール
  const { error: err2 } = await supabase
    .from('user_profile')
    .upsert({
      user_id:   userId,
      name:      '',
      group:     '',
      created_at: new Date()
    });
  if (err2) console.error('user_profile upsert error:', err2);
}

// ─────────────────────────────────────
// 1) LINE Webhook エンドポイント
// ─────────────────────────────────────
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  const events = req.body.events || [];
  console.log(`Received ${events.length} event(s)`);

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text   = event.message.text.trim();
    console.log(`From ${userId}: "${text}"`);

    // 初回登録 upsert
    await ensureUserRegistered(userId);

    // 「タスク追加 ○○」
    if (text.startsWith('タスク追加 ')) {
      const taskContent = text.slice(6).trim();
      const { error } = await supabase.from('todos').insert({
        user_id: userId,
        task:    taskContent,
        status:  '未完了',
        date:    null,
        time:    null
      });

      const replyMsg = error
        ? 'タスクの追加に失敗しました。'
        : 'タスクを追加しました！';
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: replyMsg
      });

      // 通知送信
      const { data: settings } = await supabase
        .from('user_settings')
        .select('notify')
        .eq('user_id', userId)
        .single();
      if (settings?.notify) {
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `🆕 タスク: ${taskContent}\n締切: 未定`
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
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスクの取得中にエラーが発生しました。'
        });
        continue;
      }

      const replyText = (!data || data.length === 0)
        ? '現在タスクは登録されていません。'
        : data.map(t => `✅ ${t.task}（${t.date||'未定'} ${t.time||''}） - ${t.status}`)
              .join('\n');

      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText
      });
    }
    // それ以外
    else {
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: '「タスク追加 ○○」または「進捗確認」と送信してください。'
      });
    }
  }

  res.sendStatus(200);
});

// ─────────────────────────────────────
// 2) Web からタスク追加エンドポイント
// ─────────────────────────────────────
app.post('/add-task', async (req, res) => {
  const { userId, task, deadline } = req.body;
  console.log('/add-task', { userId, task, deadline });

  if (!userId) {
    return res.status(400).json({ error: 'userIdが必要です' });
  }
  const [date, time] = (deadline || '').split(' ');

  await ensureUserRegistered(userId);

  const { error } = await supabase.from('todos').insert({
    user_id: userId,
    task,
    status: '未完了',
    date:   date || null,
    time:   time || null
  });
  if (error) {
    console.error('todos.insert error:', error);
    return res.status(500).json({ error: 'タスク登録に失敗しました' });
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('notify')
    .eq('user_id', userId)
    .single();
  if (settings?.notify) {
    await lineClient.pushMessage(userId, {
      type: 'text',
      text: `🆕 タスク: ${task}\n締切: ${deadline || '未定'}`
    });
  }

  res.json({ success: true, message: 'タスクを追加しました！' });
});

// ─────────────────────────────────────
// 3) Web からタスク取得エンドポイント
// ─────────────────────────────────────
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

// ─────────────────────────────────────
// サーバー起動
// ─────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
