require('dotenv').config(); // ローカル実行用（Render環境では不要）

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

app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf.toString(); } }));
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 📬 LINE メッセージ受付
app.post('/webhook', line.middleware(config), async (req, res) => {
  if (!req.body.events) return res.status(403).send('Forbidden');

  for (const event of req.body.events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text = event.message.text.trim();

    await supabase.from('user_settings').upsert({ user_id: userId, notify: true });

    // 💣「やってない」 → 爆撃返信（最大5件）
    if (text === 'やってない') {
      const messages = [
        { type: 'text', text: '💣 爆撃1: やってない！？今すぐ着手！' },
        { type: 'text', text: '📛 爆撃2: 本気見せる時！' },
        { type: 'sticker', packageId: '446', stickerId: '1988' },
        { type: 'text', text: '🔥 爆撃3: もう言い訳はナシ！' },
        { type: 'sticker', packageId: '446', stickerId: '2003' }
      ];
      await client.replyMessage(event.replyToken, { messages });
      continue;
    }

    // 📝「タスク追加 ○○」→ Supabase 登録
    if (text.startsWith('タスク追加 ')) {
      const taskContent = text.replace('タスク追加 ', '');
      if (!taskContent || taskContent.length > 200) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '有効なタスク内容を入力してください（200文字以内）。'
        });
        continue;
      }

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
      continue;
    }

    // 🔎「進捗確認」→ タスク一覧取得
    if (text === '進捗確認') {
      const { data } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      const replyText = data?.length
        ? data.map(t => `✅ ${t.task}（${t.date || '未定'} ${t.time || ''}） - ${t.status}`).join('\n')
        : '現在タスクは登録されていません。';

      await client.replyMessage(event.replyToken, { type: 'text', text: replyText });
      continue;
    }

    // ❓ その他 → ヘルプ表示
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '「タスク追加 ○○」「進捗確認」「やってない」と送ってください！'
    });
  }

  res.sendStatus(200);
});

// 🌐 Webフォームからのタスク追加
app.post('/add-task', async (req, res) => {
  const { task, deadline, userId } = req.body;
  if (!userId || !task) return res.status(400).json({ error: 'userIdとtaskが必要です' });

  const [date, time] = deadline?.split('T') || [null, null];

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
  }

  res.json({ success: true, message: 'タスクを追加しました！' });
});

// 🌐 Webからのタスク取得
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
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
});
