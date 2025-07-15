require('dotenv').config();

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

// 📬 LINEメッセージ受付
app.post('/webhook', line.middleware(config), async (req, res) => {
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text = event.message.text.trim();

    await supabase.from('user_settings').upsert({ user_id: userId, notify: true });

    // 💣「やってない」検知（部分一致対応）
    if (text.includes('やってない')) {
      const messages = [
        { type: 'text', text: '💣 爆撃1: やってない！？即対応！' },
        { type: 'text', text: '📛 爆撃2: 本気出すタイミングだ！' },
        { type: 'sticker', packageId: '446', stickerId: '1988' }
      ];
      await client.replyMessage(event.replyToken, messages);
      continue;
    }

    // 📝 タスク追加（部分一致で「追加」を検知）
    if (text.includes('追加')) {
      const taskContent = text.replace(/^.*追加\s*/, '').trim(); // 「追加」以降の内容抽出

      if (!taskContent || taskContent.length > 200) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '⚠️ タスク内容を200文字以内で入力してください。'
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
        text: `🆕 タスク「${taskContent}」を追加しました！`
      });
      continue;
    }

    // 🔍 進捗確認（部分一致対応）
    if (text.includes('進捧') || text.includes('進捗')) {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (error || !data || data.length === 0) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '📭 現在タスクは登録されていません。'
        });
        continue;
      }

      const MAX_LENGTH = 500;
      const lines = data.map(t => {
        const date = t.date || '未定';
        const time = t.time || '';
        const status = t.status || '未完了';
        return `🔹 ${t.task}（${date} ${time}） - ${status}`;
      });

      const chunks = [];
      let chunk = '';

      for (const line of lines) {
        if ((chunk + '\n' + line).length > MAX_LENGTH) {
          chunks.push(chunk);
          chunk = line;
        } else {
          chunk += chunk ? '\n' + line : line;
        }
      }
      if (chunk) chunks.push(chunk);

      const messages = chunks.map(c => ({ type: 'text', text: c }));
      await client.replyMessage(event.replyToken, messages);
      continue;
    }

    // ❓ その他 → 利用案内
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📌「追加 ○○」「進捗確認」「やってない」と送ってください！'
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
