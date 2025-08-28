require('dotenv').config();
const express   = require('express');
const line      = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const path      = require('path');
const cron      = require('node-cron');
const dayjs     = require('dayjs');

const app  = express();
const PORT = process.env.PORT || 3000;

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret:       process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// Supabase クライアント
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// エラーハンドリング
process.on('uncaughtException', err => console.error('[uncaughtException]', err));
process.on('unhandledRejection', reason => console.error('[unhandledRejection]', reason));

app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

// 共通関数: 期限切れ判定
function isOverdue(row) {
  if (!row.date || !row.time) return false;
  const deadline = dayjs(`${row.date} ${row.time}`, 'YYYY-MM-DD HH:mm');
  const now      = dayjs();
  console.log(`[DEBUG] 現在時刻: ${now.format('YYYY-MM-DD HH:mm:ss')} / 締切: ${deadline.format('YYYY-MM-DD HH:mm')}`);
  return deadline.isBefore(now);
}

// ===== LINE Webhook =====
app.post('/webhook', line.middleware(config), async (req, res) => {
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text   = event.message.text.trim();

    try {
      // --- タスク追加 ---
      if (/^(追加|登録)\s+/.test(text)) {
        const parts     = text.replace(/^(追加|登録)\s*/, '').trim().split(/\s+/);
        const taskText  = parts[0] || null;
        const datePart  = parts[1] || null;
        const timePart  = parts[2] || null;

        if (!taskText) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ タスク名を指定してください。\n例: 追加 宿題 2025-08-30 21:00'
          });
          continue;
        }

        const today        = dayjs().format('YYYY-MM-DD');
        const deadlineDate = datePart || today;
        const deadlineTime = timePart || null;

        const { error } = await supabase
          .from('tasks')
          .insert({
            user_id:    userId,
            task_text:  taskText,
            date:       deadlineDate,
            time:       deadlineTime,
            done:       false,
            is_notified: false
          });

        if (error) throw error;

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🆕 タスク「${taskText}」を登録しました` +
                (deadlineTime ? `（締め切り ${deadlineDate} ${deadlineTime}）` : '')
        });
        continue;
      }

      // --- 締め切り確認／進捗確認 ---
      if (text === '締め切り確認' || text === '進捗確認') {
        const { data, error } = await supabase
          .from('tasks')
          .select('id, task_text, date, time, done, is_notified')
          .order('date', { ascending: true })
          .order('time', { ascending: true });

        if (error) throw error;
        if (!data.length) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '📭 登録されたタスクがありません。'
          });
          continue;
        }

        const lines = [];
        for (const row of data) {
          const deadlineStr = `${row.date || ''} ${row.time || ''}`.trim();
          const overdue     = isOverdue(row);

          lines.push(`🔹 ${row.task_text} - ${deadlineStr || '未定'} [${row.done ? '完了' : '未完了'}]`);

          // 催促: 未完了なら必ず通知
          if (!row.done) {
            await client.pushMessage(userId, {
              type: 'text',
              text: `⏰ タスク「${row.task_text}」はまだ終わっていません！`
            });
          }

          // 爆撃: 期限切れかつ未通知
          if (overdue && !row.done && !row.is_notified) {
            await client.pushMessage(userId, [
              { type: 'text', text: `💣 タスク「${row.task_text}」の締め切りを過ぎています！` },
              { type: 'sticker', packageId: '446', stickerId: '1988' }
            ]);
            await supabase
              .from('tasks')
              .update({ is_notified: true })
              .eq('id', row.id);
          }
        }

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: lines.join('\n')
        });
        continue;
      }

      // --- 完了(状態更新) ---
      if (/^完了\s*/.test(text)) {
        const taskName = text.replace(/^完了\s*/, '').trim();
        if (!taskName) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ 完了するタスク名を指定してください'
          });
          continue;
        }

        const { error } = await supabase
          .from('tasks')
          .update({ done: true })
          .eq('task_text', taskName);

        if (error) throw error;

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `✅ タスク「${taskName}」を完了にしました。`
        });
        continue;
      }

      // --- デフォルト応答 ---
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text:
          '📌 コマンド一覧:\n' +
          '追加 タスク名 [YYYY-MM-DD] [HH:mm]\n' +
          '締め切り確認\n' +
          '進捗確認\n' +
          '完了 タスク名'
      });

    } catch (err) {
      console.error('[Webhook Error]', err);
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `❗️エラーが発生しました: ${err.message}`
      });
    }
  }
  res.sendStatus(200);
});

// ===== 定期爆撃チェック(毎分) =====
cron.schedule('* * * * *', async () => {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, user_id, task_text, date, time, done, is_notified')
    .eq('done', false)
    .neq('is_notified', true)
    .order('date', {  ascending: true })
    .order('time', {  ascending: true });

  if (error) {
    console.error('[爆撃チェックエラー]', error);
    return;
  }

  for (const row of data) {
    if (isOverdue(row)) {
      await client.pushMessage(row.user_id, [
        { type: 'text',   text: `💣 まだ終わってないタスク「${row.task_text}」を早くやれ！！` },
        { type: 'sticker', packageId: '446', stickerId: '1988' }
      ]);
      await supabase
        .from('tasks')
        .update({ is_notified: true })
        .eq('id', row.id);
    }
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
