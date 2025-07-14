require('dotenv').config();

const express    = require('express');
const path       = require('path');
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

const app = express();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const lineClient = new line.Client({
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
});

app.get('/health', (_req, res) => res.status(200).send('OK'));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); }
}));

app.post('/webhook', line.middleware({
  channelAccessToken: CHANNEL_ACCESS_TOKEN,
  channelSecret: CHANNEL_SECRET
}), async (req, res) => {
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    const userId = event.source.userId;
    const text   = event.message.text.trim();

    await supabase.from('user_settings').upsert({ user_id: userId, notify: true });

    if (text.startsWith('タスク追加 ')) {
      const taskContent = text.replace('タスク追加 ', '');
      const { error: insErr } = await supabase.from('todos').insert({
        user_id: userId,
        task: taskContent,
        status: '未完了'
      });
      if (insErr) continue;

      const { data } = await supabase.from('todos')
        .select('*').eq('user_id', userId).order('date', { ascending: true });

      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: 'タスクを追加しました！一覧を送ります。'
      });
      for (const t of data) {
        await lineClient.pushMessage(userId, {
          type: 'text',
          text: `📌 ${t.task}（${t.date||'未定'} ${t.time||''}）`
        });
      }
    }
    else if (text === '進捗確認' || text === 'タスク表示') {
      const { data } = await supabase.from('todos')
        .select('*').eq('user_id', userId).order('date', { ascending: true });
      const msg = data.length
        ? data.map(t => `✅ ${t.task}（${t.date||'未定'}） - ${t.status}`).join('\n')
        : 'タスクは未登録です。';
      await lineClient.replyMessage(event.replyToken, { type: 'text', text: msg });
    }
    else {
      await lineClient.replyMessage(event.replyToken, {
        type: 'text',
        text: '「タスク追加 ○○」や「進捗確認」を送信してください。'
      });
    }
  }
  res.sendStatus(200);
});

app.post('/add-task', async (req, res) => {
  const { userId, task, deadline } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userIdが必要です' });
  const [date, time] = (deadline||'').split(' ');
  await supabase.from('user_settings').upsert({ user_id: userId, notify: true });

  const { error } = await supabase.from('todos').insert({
    user_id: userId,
    task,
    status: '未完了',
    date: date || null,
    time: time || null
  });
  if (error) return res.status(500).json({ success: false, error: '登録に失敗しました' });

  await lineClient.pushMessage(userId, {
    type: 'text',
    text: `🆕 タスクが追加されました！\n${task}\n期限：${deadline || '未定'}`
  });

  res.json({ success: true, message: 'タスクが追加されました！' });
});

app.get('/get-tasks', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userIdが必要です' });

  const { data, error } = await supabase.from('todos')
    .select('*').eq('user_id', userId).order('date', { ascending: true });

  if (error) return res.status(500).json({ error: '取得に失敗しました' });
  res.json({ tasks: data });
});

cron.schedule('0 9 * * *', async () => {
  const { data: tasks } = await supabase.from('todos')
    .select('*').eq('status', '未完了').order('date', { ascending: true });

  const byUser = tasks.reduce((map, t) => {
    (map[t.user_id] = map[t.user_id] || []).push(t);
    return map;
  }, {});
  for (const [uid, list] of Object.entries(byUser)) {
    const { data: cfg } = await supabase.from('user_settings').select('notify')
      .eq('user_id', uid).single();
    if (!cfg?.notify) continue;
    for (const t of list) {
      await lineClient.pushMessage(uid, {
        type: 'text',
        text: `🔔 今日のタスク\n${t.task}\n期限：${t.date || '未定'} ${t.time || ''}`
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
