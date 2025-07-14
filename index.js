require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const line = require('@line/bot-sdk');
const cron = require('node-cron');

// 環境変数読み込み
const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PORT = 3000
} = process.env;

// LINE Client 初期化
const lineConfig = {
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
};
const lineClient = new line.Client(lineConfig);

// Supabase Client 初期化
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Express アプリ初期化
const app = express();

// LINE 署名検証用の rawBody 取得
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// ── 定期爆撃通知 (毎朝9:00) ──
cron.schedule('0 9 * * *', async () => {
  try {
    // 「未完了」タスクをすべて取得
    const { data: tasks, error } = await supabase
      .from('todos')
      .select('*')
      .eq('status', '未完了')
      .order('date', { ascending: true });

    if (error) throw error;

    // ユーザーごとにグルーピング
    const byUser = tasks.reduce((acc, t) => {
      acc[t.user_id] = acc[t.user_id] || [];
      acc[t.user_id].push(t);
      return acc;
    }, {});

    // 各ユーザーへ通知
    for (const [userId, list] of Object.entries(byUser)) {
      // 通知設定をチェック
      const { data: settings } = await supabase
        .from('user_settings')
        .select('notify')
        .eq('user_id', userId)
        .single();

      if (!settings?.notify) continue;

      for (const t of list) {
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `🔔 今日のタスク\n${t.task}\n期限: ${t.date || '未定'} ${t.time || ''}`
        });
      }
    }

    console.log('定期通知: 成功');
  } catch (err) {
    console.error('定期通知: エラー', err);
  }
});

// ── LINE Webhook ──
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  const events = req.body.events || [];

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text = event.message.text.trim();

    // 通知ON を保証
    await supabase.from('user_settings').upsert({
      user_id: userId,
      notify: true
    });

    // タスク追加
    if (text.startsWith('タスク追加 ')) {
      const taskContent = text.replace('タスク追加 ', '');

      // Supabase に登録
      const { error: insertError } = await supabase.from('todos').insert({
        user_id: userId,
        task: taskContent,
        status: '未完了',
        date: null,
        time: null
      });
      if (insertError) {
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスク登録に失敗しました😭'
        });
        continue;
      }

      // 全タスク取得
      const { data: allTasks, error: fetchError } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (fetchError) {
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスク一覧取得に失敗しました…'
        });
        continue;
      }

      // 返信＋爆撃プッシュ
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: 'タスクを追加しました！\n全タスクを送信します…'
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
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      const replyText = (error || !data || data.length === 0)
        ? '現在タスクは登録されていません。'
        : data.map(t => `✅ ${t.task}（${t.date || '未定'}） - ${t.status}`).join('\n');

      await lineClient.replyMessage(event.replyToken, { type: 'text', text: replyText });
    }

    // タスク表示
    else if (text === 'タスク表示') {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      const replyText = (error || !data || data.length === 0)
        ? '現在タスクは登録されていません。'
        : data.map(t => `   ${t.task}（${t.date || '未定'}） - ${t.status}`).join('\n');

      await lineClient.replyMessage(event.replyToken, { type: 'text', text: replyText });
    }

    // その他
    else {
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: '「タスク追加 ○○」／「進捗確認」／「タスク表示」を送信してください。'
      });
    }
  }

  res.sendStatus(200);
});

// ── Web からタスク追加 API ──
app.post('/add-task', async (req, res) => {
  const { task, deadline, userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userIdが必要です' });
  }

  const [date, time] = (deadline || '').split(' ');

  // 通知ON を保証
  await supabase.from('user_settings').upsert({
    user_id: userId,
    notify: true
  });

  const { error } = await supabase.from('todos').insert({
    user_id: userId,
    task,
    status: '未完了',
    date: date || null,
    time: time || null
  });
  if (error) {
    console.error('Supabase登録失敗:', error.message);
    return res.status(500).json({ error: '登録失敗' });
  }

  // プッシュ通知
  try {
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
  } catch (err) {
    console.warn('LINE通知エラー:', err.message);
  }

  res.json({ success: true, message: 'タスクを追加しました！' });
});

// ── Web からタスク取得 API ──
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
    console.error('タスク取得エラー:', error.message);
    return res.status(500).json({ error: '取得失敗' });
  }

  res.json({ tasks: data });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
