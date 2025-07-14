// index.js

require('dotenv').config();

const express    = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const line       = require('@line/bot-sdk');
const cron       = require('node-cron');

const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PORT = 3000
} = process.env;

// LINE クライアント
const lineClient = new line.Client({
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
});

// Supabase クライアント
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();

// public 配下の静的ファイルを配信
app.use(express.static('public'));

// JSON／rawBody パース
app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

// ── LINE Webhook ──
app.post('/webhook', line.middleware({
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
}), async (req, res) => {
  const events = req.body.events || [];
  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text   = event.message.text.trim();

    // 通知ON を保証
    await supabase.from('user_settings').upsert({
      user_id: userId,
      notify: true
    });

    // コマンド処理は省略（タスク追加・進捗確認などを実装）
  }
  res.sendStatus(200);
});

// ── Web からタスク追加 ──
app.post('/add-task', async (req, res) => {
  const { userId, task, deadline } = req.body;
  if (!userId) {
    return res.status(400).json({ success: false, error: 'userIdが必要です' });
  }
  const [date, time] = (deadline || '').split(' ');

  // user_settings upsert
  await supabase.from('user_settings').upsert({
    user_id: userId,
    notify: true
  });

  // todos に INSERT
  const { data: insData, error: insErr } = await supabase
    .from('todos')
    .insert({
      user_id: userId,
      task,
      status: '未完了',
      date: date || null,
      time: time || null
    });

  if (insErr) {
    console.error('[Supabase][INSERT] Error:', insErr);
    return res.status(500).json({ success: false, error: '登録に失敗しました' });
  }

  // LINE 通知
  try {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('notify')
      .eq('user_id', userId)
      .single();
    if (settings?.notify) {
      await lineClient.pushMessage(userId, {
        type: 'text',
        text: `🆕 タスクが追加されました！\n${task}\n期限：${deadline || '未定'}`
      });
    }
  } catch (pushErr) {
    console.warn('[LINE] push error:', pushErr.message);
  }

  // 成功レスポンス
  res.json({ success: true, message: 'タスクが追加されました！' });
});

// ── Web からタスク取得 ──
app.get('/get-tasks', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'userIdが必要です' });
  }
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });
  if (error) {
    console.error('[Supabase][SELECT] Error:', error);
    return res.status(500).json({ error: '取得に失敗しました' });
  }
  res.json({ tasks: data });
});

// ── Cron で定期通知（任意） ──
cron.schedule('0 9 * * *', async () => {
  try {
    const { data: tasks, error } = await supabase
      .from('todos')
      .select('*')
      .eq('status', '未完了');
    if (error) throw error;

    const byUser = tasks.reduce((m, t) => {
      (m[t.user_id] = m[t.user_id] || []).push(t);
      return m;
    }, {});

    for (const [uid, list] of Object.entries(byUser)) {
      const { data: cfg } = await supabase
        .from('user_settings')
        .select('notify')
        .eq('user_id', uid)
        .single();
      if (!cfg?.notify) continue;
      for (const t of list) {
        await lineClient.pushMessage(uid, {
          type: 'text',
          text: `🔔 今日のタスク\n${t.task}\n期限：${t.date || '未定'} ${t.time || ''}`
        });
      }
    }
  } catch (err) {
    console.error('[Cron] Error:', err);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
