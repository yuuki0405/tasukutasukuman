const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');

// LINE Bot設定（.envで管理）
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);
const app = express();

// LINE SDKが署名検証に使う rawBody を取得する
app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Supabaseクライアントの初期化
const supabase = createClient(
  'https://bteklaezhlfmjylybrlh.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔔 LINE Webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text = event.message.text.trim();

    if (text.startsWith('タスク追加 ')) {
      const taskContent = text.replace('タスク追加 ', '');

      const { error } = await supabase.from('todos').insert({
        user_id: userId,
        task: taskContent,
        status: '未完了',
        date: null,
        time: null
      });

      const reply = error
        ? 'タスクの追加に失敗しました。'
        : 'タスクを追加しました！';

      await client.replyMessage(event.replyToken, { type: 'text', text: reply });

      // ✅ 通知設定を確認して送信
      const { data: settings } = await supabase
        .from('user_settings')
        .select('notify')
        .eq('user_id', userId)
        .single();

      if (settings?.notify) {
        await client.pushMessage(userId, {
          type: 'text',
          text: `🆕 タスク: ${taskContent}\n締切: 未定`
        });
      }
    }

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
        replyText = data.map(t =>
          `✅ ${t.task}（${t.date || '未定'} ${t.time || ''}） - ${t.status}`
        ).join('\n');
      }

      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText
      });
    }

    else {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '「タスク追加 ○○」または「進捗確認」と送信してください。'
      });
    }
  }

  res.sendStatus(200);
});

// 🌐 Webアプリからタスク追加（通知あり）
app.post('/add-task', async (req, res) => {
  const { task, deadline, userId = 'web-user' } = req.body;
  const [date, time] = deadline?.split(' ') || [null, null];

  const { error } = await supabase.from('todos').insert({
    user_id: userId,
    task,
    status: '未完了',
    date,
    time
  });

  if (error) {
    console.error('Supabase登録失敗:', error.message);
    return res.status(500).json({ error: '登録失敗' });
  }

  // ✅ 通知設定を確認して送信
  try {
    if (userId !== 'web-user') {
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
    }
  } catch (err) {
    console.warn('LINE通知エラー:', err.message);
  }

  res.json({ success: true, message: 'タスクを追加しました！' });
});

// 🌐 Webアプリからタスク取得
app.get('/get-tasks', async (req, res) => {
  const userId = req.query.userId || 'web-user';

  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) {
    console.error('取得エラー:', error.message);
    return res.status(500).json({ error: '取得失敗' });
  }

  res.json({ tasks: data });
});

// ✅ 起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
