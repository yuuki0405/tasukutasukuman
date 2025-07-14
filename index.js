require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const line = require('@line/bot-sdk');
const cron = require('node-cron');

//
// 環境変数読み込み
//
const {
  CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PORT = 3000
} = process.env;

//
// LINE Client 設定
//
const lineConfig = {
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
};
const lineClient = new line.Client(lineConfig);

//
// Supabase Client 設定
//
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

//
// Express アプリ初期化
//
const app = express();

// LINE署名検証のため rawBody を取得
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

//
// 定期爆撃通知：毎朝 9:00 に未完了タスクをユーザーごとに送信
// 日本時間サーバーの場合は '0 0 0 * * *' など事前調整を
//
cron.schedule('0 9 * * *', async () => {
  try {
    // 未完了タスクを全件取得
    const { data: tasks, error } = await supabase
      .from('todos')
      .select('*')
      .eq('status', '未完了')
      .order('date', { ascending: true });

    if (error || !tasks) {
      console.error('定期通知：タスク取得失敗', error);
      return;
    }

    // ユーザーごとにグルーピング
    const byUser = tasks.reduce((acc, t) => {
      acc[t.user_id] = acc[t.user_id] || [];
      acc[t.user_id].push(t);
      return acc;
    }, {});

    // 各ユーザーに順次プッシュ
    for (const [userId, list] of Object.entries(byUser)) {
      for (const t of list) {
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `🔔 Reminder\n${t.task}\n期限: ${t.date || '未定'}`
        });
      }
    }

    console.log('定期通知：完了');
  } catch (err) {
    console.error('定期通知でエラー', err);
  }
});

//
// LINE Webhook エンドポイント
//
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  const events = req.body.events || [];

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') {
      continue;
    }

    const userId = event.source.userId;
    const text = event.message.text.trim();

    // ユーザー設定を upsert（通知ON）
    await supabase.from('user_settings').upsert({
      user_id: userId,
      notify: true
    });

    // 「タスク追加 ○○」
    if (text.startsWith('タスク追加 ')) {
      const taskContent = text.replace('タスク追加 ', '');

      // タスク登録
      await supabase.from('todos').insert({
        user_id: userId,
        task: taskContent,
        status: '未完了',
        date: null,
        time: null
      });

      // 全タスク取得 → 爆撃プッシュ
      const { data: allTasks, error: fetchError } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (fetchError || !allTasks) {
        await lineClient.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスク取得に失敗しました…'
        });
        continue;
      }

      // まずは返信
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: 'タスクを追加しました！\nタスク一覧を送信中…'
      });

      // プッシュ通知で一覧を連投
      for (const t of allTasks) {
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `📌 ${t.task}（${t.date || '未定'}） - ${t.status}`
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

      let replyText = '';
      if (error || !data || data.length === 0) {
        replyText = '現在タスクは登録されていません。';
      } else {
        replyText = data
          .map(t => `✅ ${t.task}（${t.date || '未定'}） - ${t.status}`)
          .join('\n');
      }

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

      let replyText = '';
      if (error || !data || data.length === 0) {
        replyText = '現在タスクは登録されていません。';
      } else {
        replyText = data
          .map(t => `   ${t.task}（${t.date || '未定'}） - ${t.status}`)
          .join('\n');
      }

      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText
      });
    }

    // デフォルト案内
    else {
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: '「タスク追加 ○○」・「進捗確認」・「タスク表示」を送信してください。'
      });
    }
  }

  res.sendStatus(200);
});

//
// Web からタスク追加 API
//
app.post('/add-task', async (req, res) => {
  const { task, deadline, userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userIdが必要です' });
  }

  const [date, time] = (deadline || '').split(' ');

  // user_settings を upsert
  await supabase.from('user_settings').upsert({
    user_id: userId,
    notify: true
  });

  // todos登録
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

  // 通知ONなら LINE push
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

//
// Web からタスク取得 API
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
    console.error('タスク取得エラー:', error.message);
    return res.status(500).json({ error: '取得失敗' });
  }

  res.json({ tasks: data });
});

//
// サーバー起動
//
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
