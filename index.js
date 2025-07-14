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

// ── Health Check ──
app.get('/health', (_req, res) => res.send('OK'));

// ── 静的ファイル配信 ──
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); }
}));

// ── LINE Webhook ──
app.post('/webhook',
  line.middleware({ channelAccessToken: CHANNEL_ACCESS_TOKEN, channelSecret: CHANNEL_SECRET }),
  async (req, res) => {
    for (const event of req.body.events || []) {
      if (event.type !== 'message' || event.message.type !== 'text') continue;
      const userId = event.source.userId;
      const text   = event.message.text.trim();
      // 通知ON保証
      await supabase.from('user_settings').upsert({ user_id: userId, notify: true });

      if (text.startsWith('タスク追加 ')) {
        const task = text.replace('タスク追加 ', '');
        // INSERT
        const { error: insErr } = await supabase.from('todos').insert({
          user_id: userId, task, status: '未完了', date: null, time: null
        });
        if (insErr) {
          await lineClient.replyMessage(event.replyToken, { type: 'text', text: '登録失敗' });
          continue;
        }
        // SELECT & プッシュ
        const { data, error: selErr } = await supabase
          .from('todos')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: true });
        if (selErr) {
          await lineClient.replyMessage(event.replyToken, { type: 'text', text: '取得失敗' });
          continue;
        }
        await lineClient.replyMessage(event.replyToken, {
          type: 'text', text: 'タスクを追加しました！一覧をお送りします…'
        });
        for (const t of data) {
          await lineClient.pushMessage(userId, {
            type: 'text',
            text: `📌 ${t.task}（${t.date||'未定'} ${t.time||''}）`
          });
        }
      }
      else if (text === '進捗確認' || text === 'タスク表示') {
        const { data, error } = await supabase
          .from('todos')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: true });
        const reply = (!data || data.length === 0)
          ? 'タスクがありません。'
          : data.map(t => `✅ ${t.task}（${t.date||'未定'}） - ${t.status}`).join('\n');
        await lineClient.replyMessage(event.replyToken, { type: 'text', text: reply });
      }
      else {
        await lineClient.replyMessage(event.replyToken, {
          type: 'text', text: '「タスク追加 ○○」／「進捗確認」／「タスク表示」を送ってください。'
        });
      }
    }
    res.sendStatus(200);
  }
);

// ── Web API：タスク追加 ──
app.post('/add-task', async (req, res) => {
  const { userId, task, deadline } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userId必須' });
  const [date, time] = (deadline||'').split(' ');
  await supabase.from('user_settings').upsert({ user_id: userId, notify: true });
  const { error: insErr } = await supabase.from('todos').insert({
    user_id: userId, task, status: '未完了', date: date||null, time: time||null
  });
  if (insErr) return res.status(500).json({ success: false, error: '登録失敗' });
  // LINE通知
  const { data: cfg } = await supabase.from('user_settings').select('notify').eq('user_id', userId).single();
  if (cfg?.notify) {
    await lineClient.pushMessage(userId, {
      type: 'text', text: `🆕 タスクが追加されました！\n${task}\n期限：${deadline||'未定'}`
    });
  }
  res.json({ success: true, message: 'タスクが追加されました！' });
});

// ── Web API：タスク取得 ──
app.get('/get-tasks', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId必須' });
  const { data, error } = await supabase.from('todos').select('*').eq('user_id', userId).order('date',{ascending:true});
  if (error) return res.status(500).json({ error: '取得失敗' });
  res.json({ tasks: data });
});

// ── Cron：毎朝9時に未完了タスク通知 ──
cron.schedule('0 9 * * *', async () => {
  const { data: tasks, error } = await supabase.from('todos').select('*').eq('status','未完了');
  if (error) return console.error('[Cron]', error);
  const byUser = tasks.reduce((m,t)=>{(m[t.user_id]=m[t.user_id]||[]).push(t);return m;}, {});
  for (const [uid, list] of Object.entries(byUser)) {
    const { data: cfg } = await supabase.from('user_settings').select('notify').eq('user_id',uid).single();
    if (!cfg?.notify) continue;
    for (const t of list) {
      await lineClient.pushMessage(uid, {
        type: 'text', text: `🔔 今日のタスク\n${t.task}\n期限：${t.date||'未定'} ${t.time||''}`
      });
    }
  }
});

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
