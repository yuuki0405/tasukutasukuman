require('dotenv').config();

const express    = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const line       = require('@line/bot-sdk');
const cron       = require('node-cron');

// 環境変数読み込み
const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PORT = 3000
} = process.env;

// 起動時に環境変数をログ出力
console.log('SUPABASE_URL=', SUPABASE_URL);
console.log('SUPABASE_KEY=', SUPABASE_SERVICE_ROLE_KEY?.slice(0,5) + '...');

// LINE Client 初期化
const lineConfig = {
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
};
const lineClient = new line.Client(lineConfig);

// Supabase Client 初期化
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Express アプリ準備
const app = express();
app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

// ── 定期爆撃通知 ──
// 毎朝9:00に全未完了タスクをユーザーごとに通知
cron.schedule('0 9 * * *', async () => {
  console.log('[Cron] 定期通知開始');
  try {
    const { data: tasks, error: selErr } = await supabase
      .from('todos')
      .select('*')
      .eq('status', '未完了')
      .order('date', { ascending: true });

    if (selErr) {
      console.error('[Supabase][SELECT] Error fetching todos:', selErr);
      return;
    }
    console.log('[Supabase][SELECT] Fetched', tasks.length, 'tasks');

    // user_id ごとにグループ化
    const byUser = tasks.reduce((acc, t) => {
      (acc[t.user_id] = acc[t.user_id] || []).push(t);
      return acc;
    }, {});

    for (const [userId, list] of Object.entries(byUser)) {
      // 通知ON設定を取得
      const { data: settings, error: cfgErr } = await supabase
        .from('user_settings')
        .select('notify')
        .eq('user_id', userId)
        .single();

      if (cfgErr) {
        console.error('[Supabase][SELECT] user_settings error:', cfgErr);
        continue;
      }
      if (!settings?.notify) continue;

      for (const t of list) {
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `🔔 今日のタスク\n${t.task}\n期限: ${t.date || '未定'} ${t.time || ''}`
        });
      }
    }

    console.log('[Cron] 定期通知完了');
  } catch (err) {
    console.error('[Cron] Unexpected error:', err);
  }
});

// ── LINE Webhook ──
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  const events = req.body.events || [];
  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    const userId = event.source.userId;
    const text   = event.message.text.trim();

    // 通知ONを保証
    await supabase.from('user_settings').upsert({
      user_id: userId,
      notify: true
    });

    // タスク追加コマンド
    if (text.startsWith('タスク追加 ')) {
      const taskContent = text.replace('タスク追加 ', '');

      // INSERT
      const { data: insData, error: insErr } = await supabase
        .from('todos')
        .insert({
          user_id: userId,
          task: taskContent,
          status: '未完了',
          date: null,
          time: null
        });

      if (insErr) {
        console.error('[Supabase][INSERT] Error inserting todo:', insErr);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスク登録に失敗しました。'
        });
        continue;
      }
      console.log('[Supabase][INSERT] Inserted:', insData);

      // 全タスク取得（SELECT）
      const { data: allTasks, error: selErr } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (selErr) {
        console.error('[Supabase][SELECT] Error fetching todos:', selErr);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスク一覧取得に失敗しました。'
        });
        continue;
      }
      console.log('[Supabase][SELECT] Fetched after insert:', allTasks.length);

      // 返信＋爆撃プッシュ
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: 'タスクを追加しました！\n全タスクを送信中…'
      });
      for (const t of allTasks) {
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `📌 ${t.task}（${t.date || '未定'} ${t.time || ''}）`
        });
      }
    }

    // 進捗確認
    else if (text === '進捗確認') {
      const { data, error: selErr } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (selErr) {
        console.error('[Supabase][SELECT] Error fetching todos:', selErr);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: '進捗取得に失敗しました。'
        });
        continue;
      }

      const replyText = data.length === 0
        ? '現在タスクは登録されていません。'
        : data.map(t => `✅ ${t.task}（${t.date || '未定'}） - ${t.status}`).join('\n');

      await lineClient.replyMessage(event.replyToken, { type: 'text', text: replyText });
    }

    // タスク表示
    else if (text === 'タスク表示') {
      const { data, error: selErr } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (selErr) {
        console.error('[Supabase][SELECT] Error fetching todos:', selErr);
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスク取得に失敗しました。'
        });
        continue;
      }

      const replyText = data.length === 0
        ? '現在タスクは登録されていません。'
        : data.map(t => `   ${t.task}（${t.date || '未定'}） - ${t.status}`).join('\n');

      await lineClient.replyMessage(event.replyToken, { type: 'text', text: replyText });
    }

    // それ以外
    else {
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: '「タスク追加 ○○」／「進捗確認」／「タスク表示」を送ってください。'
      });
    }
  }

  res.sendStatus(200);
});

// ── Web API：タスク追加／取得 ──
app.post('/add-task', async (req, res) => {
  const { task, deadline, userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userIdが必要です' });

  const [date, time] = (deadline || '').split(' ');

  // UPsert user_settings
  await supabase.from('user_settings').upsert({
    user_id: userId,
    notify: true
  });

  // INSERT
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
    console.error('[Supabase][INSERT] /add-task error:', insErr);
    return res.status(500).json({ error: '登録失敗' });
  }
  console.log('[Supabase][INSERT] /add-task inserted:', insData);

  // 既存設定チェック＆LINE通知
  try {
    const { data: settings, error: cfgErr } = await supabase
      .from('user_settings')
      .select('notify')
      .eq('user_id', userId)
      .single();

    if (cfgErr) console.error('[Supabase][SELECT] /add-task settings error:', cfgErr);
    if (settings?.notify) {
      await lineClient.pushMessage(userId, {
        type: 'text',
        text: `🆕 タスク: ${task}\n締切: ${deadline || '未定'}`
      });
    }
  } catch (err) {
    console.warn('[LINE] /add-task push error:', err.message);
  }

  res.json({ success: true, message: 'タスクを追加しました！' });
});

app.get('/get-tasks', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userIdが必要です' });

  const { data, error: selErr } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (selErr) {
    console.error('[Supabase][SELECT] /get-tasks error:', selErr);
    return res.status(500).json({ error: '取得失敗' });
  }
  console.log('[Supabase][SELECT] /get-tasks fetched:', data.length);

  res.json({ tasks: data });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
