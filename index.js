require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const path = require('path');
const cron = require('node-cron');
const dayjs = require('dayjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// LINE Bot設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// Supabase設定
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

process.on('uncaughtException', err => console.error('[uncaughtException]', err));
process.on('unhandledRejection', reason => console.error('[unhandledRejection]', reason));

app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf.toString(); }}));

// LINE Webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const lineUserId = event.source.userId;
    const text = event.message.text.trim();
    const now = dayjs();

    try {
      // ===== タスク追加 =====
      if (/^(追加|登録)\s+/.test(text)) {
        const parts = text.replace(/^(追加|登録)\s*/, '').trim().split(/\s+/);
        const content = parts[0] || null;
        const datePart = parts[1] || null;
        const timePart = parts[2] || null;

        if (!content) {
          await client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 内容を指定してください。\n例: 追加 宿題 2025-08-30 21:00' });
          continue;
        }

        const today = new Date();
        const deadlineDate = datePart || today.toISOString().split('T')[0];
        const deadlineTime = timePart || null;

        const { error } = await supabase
          .from('todos')
          .insert({
            user_id: lineUserId,
            task: content,
            status: '未完了',
            date: deadlineDate,
            time: deadlineTime,
            is_notified: false
          });

        if (error) throw error;

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🆕 タスク「${content}」を登録しました${deadlineTime ? `（締め切り ${deadlineDate} ${deadlineTime}）` : ''}`
        });
        continue;
      }

      // ===== 締め切り確認（即爆撃） =====
      if (text === '締め切り確認') {
        const { data, error } = await supabase
          .from('todos')
          .select('id, task, date, time, status, is_notified')
          .eq('user_id', lineUserId)
          .order('date', { ascending: true })
          .order('time', { ascending: true });

        if (error) throw error;
        if (!data.length) {
          await client.replyMessage(event.replyToken, { type: 'text', text: '📭 タスクは登録されていません。' });
          continue;
        }

        const lines = [];
        for (const t of data) {
          const deadlineStr = `${t.date || ''} ${t.time || ''}`.trim();
          const overdue = t.date && t.time && dayjs(`${t.date} ${t.time}`).isBefore(now);

          lines.push(`🔹 ${t.task} - ${deadlineStr || '未定'} [${t.status}]`);

          if (overdue && t.status === '未完了' && !t.is_notified) {
            await client.pushMessage(lineUserId, [
              { type: 'text', text: `💣 タスク「${t.task}」の締め切りを過ぎています！今すぐ対応してください！` },
              { type: 'sticker', packageId: '446', stickerId: '1988' }
            ]);

            await supabase
              .from('todos')
              .update({ is_notified: true })
              .eq('id', t.id);
          }
        }

        await client.replyMessage(event.replyToken, { type: 'text', text: lines.join('\n') });
        continue;
      }

      // ===== 完了（削除） =====
      if (/^完了\s*/.test(text)) {
        const taskName = text.replace(/^完了\s*/, '').trim();
        if (!taskName) {
          await client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 完了するタスク名を指定してください' });
          continue;
        }

        const { error } = await supabase
          .from('todos')
          .delete()
          .eq('task', taskName);
        
        if (error) throw error;

        await client.replyMessage(event.replyToken, { type: 'text', text: `✅ タスク「${taskName}」を削除しました。` });
        continue;
      }

      // ===== 進捗確認 =====
      if (text === '進捗確認') {
        const { data, error } = await supabase
          .from('todos')
          .select('task, date, time, status')
          .eq('user_id', lineUserId)
          .order('date', { ascending: true })
          .order('time', { ascending: true });

        if (error) throw error;
        if (!data.length) {
          await client.replyMessage(event.replyToken, { type: 'text', text: '📭 タスクは登録されていません。' });
          continue;
        }

        const lines = data.map(t => `🔹 ${t.task}（${t.date || '未定'} ${t.time || ''}） - ${t.status}`);
        await client.replyMessage(event.replyToken, { type: 'text', text: lines.join('\n') });
        continue;
      }

      // ===== デフォルト応答 =====
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '📌 コマンド:\n追加 タスク名 [日付] [時間]\n締め切り確認\n完了 タスク名\n進捗確認'
      });

    } catch (err) {
      console.error('[Webhook Error]', err);
      await client.replyMessage(event.replyToken, { type: 'text', text: `❗️エラー: ${err.message}` });
    }
  }
  res.sendStatus(200);
});

// ===== 定期爆撃チェック（毎分） =====
cron.schedule('* * * * *', async () => {
  const now = dayjs();
  const { data, error } = await supabase
    .from('todos')
    .select('id, user_id, task, date, time, status, is_notified')
    .eq('status', '未完了')
    .neq('is_notified', true);

  if (error) {
    console.error('[爆撃チェックエラー]', error);
    return;
  }

  for (const t of data) {
    if (!t.date || !t.time) continue;
    if (dayjs(`${t.date} ${t.time}`).isBefore(now)) {
      await client.pushMessage(t.user_id, [
        { type: 'text', text: `💣 タスク「${t.task}」の締め切りを過ぎています！今すぐ対応してください！` },
        { type: 'sticker', packageId: '446', stickerId: '1988' }
      ]);
      await supabase
        .from('todos')
        .update({ is_notified: true })
        .eq('id', t.id);
    }
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
