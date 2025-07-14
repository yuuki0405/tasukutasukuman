// index.js

require('dotenv').config();

const express    = require('express');
const path       = require('path');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const line       = require('@line/bot-sdk');
const cron       = require('node-cron');

//
// 環境変数
//
const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PORT = 3000
} = process.env;

//
// LINE クライアント
//
const lineClient = new line.Client({
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
});

//
// Supabase クライアント
//
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

//
// Express アプリ
//
const app = express();

// public フォルダ内の静的ファイルを配信 (index.html が GET / に対応)
app.use(express.static(path.join(__dirname, 'public')));

// JSON と rawBody(署名検証用)のパース
app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

//
// ── LINE Webhook ──
//
app.post('/webhook', line.middleware({
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
}), async (req, res) => {
  const events = req.body.events || [];

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text   = event.message.text.trim();

    // 通知フラグ保証
    await supabase.from('user_settings').upsert({
      user_id: userId,
      notify: true
    });

    // 「タスク追加 ○○」
    if (text.startsWith('タスク追加 ')) {
      const taskContent = text.replace('タスク追加 ', '');

      // INSERT
      const { error: insErr } = await supabase
        .from('todos')
        .insert({
          user_id: userId,
          task: taskContent,
          status: '未完了',
          date: null,
          time: null
        });

      if (insErr) {
        console.error('[INSERT] Error:', insErr);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスクの登録に失敗しました。'
        });
        continue;
      }

      // SELECT して全タスクをプッシュ
      const { data: allTasks, error: selErr } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (selErr) {
        console.error('[SELECT] Error:', selErr);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスク一覧の取得に失敗しました。'
        });
        continue;
      }

      // 返信＋プッシュ通知
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: 'タスクを追加しました！一覧を送信します…'
      });
      for (const t of allTasks) {
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `📌 ${t.task}（${t.date || '未定'} ${t.time || ''}）`
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
        console.error('[SELECT] Error:', error);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: '進捗取得に失敗しました。'
        });
        continue;
      }

      const replyText = data.length
        ? data.map(t => `✅ ${t.task}（${t.date || '未定'}） - ${t.status}`).join('\n')
        : '現在タスクは登録されていません。';

      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText
      });
    }

    // 「タスク表示」
    else if (text === 'タスク表示') {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (error) {
        console.error('[SELECT] Error:', error);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスク取得に失敗しました。'
        });
        continue;
      }

      const replyText = data.length
        ? data.map(t => `   ${t.task}（${t.date || '未定'}） - ${t.status}`).join('\n')
        : '現在タスクは登録されていません。';

      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText
      });
    }

    // それ以外
    else {
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: '「タスク追加 ○○」／「進捗確認」／「タスク表示」を送信してください。'
      });
    }
  }

  res.sendStatus(200);
});

//
// ── Web API：タスク追加 ──
//
app.post('/add-task', async (req, res) => {
  const { userId, task, deadline } = req.body;
  if (!userId) {
    return res.status(400).json({ success: false, error: 'userIdが必要です' });
  }

  const [date, time] = (deadline || '').split(' ');
  // 通知ON保証
  await supabase.from('user_settings').upsert({
    user_id: userId,
    notify: true
  });

  // INSERT
  const { error: insErr } = await supabase
    .from('todos')
    .insert({
      user_id: userId,
      task,
      status: '未完了',
      date: date || null,
      time: time || null
    });

  if (insErr) {
    console.error('[INSERT] /add-task error:', insErr);
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

  res.json({ success: true, message: 'タスクが追加されました！' });
});

//
// ── Web API：タスク取得 ──
//
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
    console.error('[SELECT] /get-tasks error:', error);
    return res.status(500).json({ error: '取得に失敗しました' });
  }

  res.json({ tasks: data });
});

//
// ── Cron：毎朝9:00の定期通知 ──
//
cron.schedule('0 9 * * *', async () => {
  console.log('[Cron] 定期通知開始');
  try {
    const { data: tasks, error } = await supabase
      .from('todos')
      .select('*')
      .eq('status', '未完了')
      .order('date', { ascending: true });

    if (error) throw error;

    // ユーザーごとグループ化
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

    console.log('[Cron] 定期通知完了');
  } catch (err) {
    console.error('[Cron] エラー:', err);
  }
});

//
// サーバー起動
//
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
