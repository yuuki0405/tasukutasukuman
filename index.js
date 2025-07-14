import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { Client as LineClient } from '@line/bot-sdk';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const lineClient = new LineClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

app.post('/add-task', async (req, res) => {
  const { userId, task, date, time } = req.body;

  await supabase.from('todos').insert({ user_id: userId, task, date, time });

  if (task.includes('やってない')) {
    const messages = [
      { type: 'text', text: '💥 やってないって何！？今すぐ着手！' },
      { type: 'text', text: '🔥 タスクに火をつけろ！🔥' },
      { type: 'text', text: '📣 進捗どうですか！？📣' }
    ];
    for (const msg of messages) {
      await lineClient.pushMessage(userId, msg);
    }
  }

  res.json({ success: true });
});

app.get('/get-tasks', async (req, res) => {
  const { userId } = req.query;
  const { data } = await supabase.from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  res.json({ tasks: data });
});

app.post('/webhook', (req, res) => {
  req.body.events.forEach(async (event) => {
    const userId = event.source.userId;
    const text = event.message?.text;

    if (text === '進捗確認') {
      const { data } = await supabase.from('todos').select('*').eq('user_id', userId);
      const reply = data.length
        ? data.map(t => `📌 ${t.task}（${t.date || '未定'}）`).join('\n')
        : '📭 タスクは登録されていません。';
      await lineClient.replyMessage(event.replyToken, { type: 'text', text: reply });
    }
  });
  res.sendStatus(200);
});

app.listen(3000, () => console.log('🚀 Server running on port 3000'));
