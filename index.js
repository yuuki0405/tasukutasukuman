const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.Client(config);
const app = express();

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use(express.static('public'));
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔔 LINE Webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  for (const event of req.body.events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text = event.message.text.trim();

    await supabase.from('user_settings').upsert({ user_id: userId, notify: true });

    if (text.startsWith('タスク追加 ')) {
      const taskContent = text.replace('タスク追加 ', '');

      await supabase.from('todos').insert({
        user_id: userId,
        task: taskContent,
        status: '未完了',
        date: null,
        time: null
      });

      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: 'タスクを追加しました！'
      });

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

      if (taskContent.includes('やってない')) {
        const messages = Array.from({ length: 100 }, (_, i) => ({
          type: 'text',
          text: `💣 爆撃${i + 1}: やってないなんて言わせない！`
        }));
        for (const msg of messages) {
          await client.pushMessage(userId, msg);
        }
      }
    }

    else if (text === '進捗確認') {
      const { data } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      const replyText = data?.length
        ? data.map(t => `✅ ${t.task}（${t.date || '未定'} ${t.time || ''}） - ${t.status}`).join('\n')
        : '現在タスクは登録されていません。';

      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText
      });
    }

    else {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '「タスク追加 ○○」または「進捗確認」と送ってください。'
      });
    }
  }

  res.sendStatus(200);
});

// 🌐 Webからタスク追加
app.post('/add-task', async (req, res) => {
  const { task, deadline, userId } = req.body;

  if (!userId) return res.status(400).json({ error: 'userIdが必要です' });

  const [date, time] = deadline?.split(' ') || [null, null];

  await supabase.from('user_settings').upsert({ user_id: userId, notify: true });

  const { error } = await supabase.from('todos').insert({
    user_id: userId,
    task,
    status: '未完了',
    date,
    time
  });

  if (error) return res.status(500).json({ error: '登録失敗' });

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

    if (task.includes('やってない')) {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        type: 'text',
        text: `💣 爆撃${i + 1}: やってないなんて言わせない！`
      }));
      for (const msg of messages) {
        await client.pushMessage(userId, msg);
      }
    }
  }

  res.json({ success: true, message: 'タスクを追加しました！' });
});

// 🌐 Webからタスク取得
app.get('/get-tasks', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userIdが必要です' });

  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) return res.status(500).json({ error: '取得失敗' });
  res.json({ tasks: data });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
