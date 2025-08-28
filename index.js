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
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

// LINE Bot 設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret:      process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

// Supabase クライアント
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// エラーハンドリング
process.on('uncaughtException', err => console.error('[uncaughtException]', err));
process.on('unhandledRejection', err => console.error('[unhandledRejection]', err));

// 催促／焦りメッセージ集
const URGE_PHRASES = {
  normal: [
    '⏰ 「${task}」、まだ終わっていませんよ！',
    '🔥 早く「${task}」を片付けましょう！',
    '💡 忘れないうちに「${task}」をやってください！'
  ],
  near: [
    '⚠️ 「${task}」の締め切りが迫っています！急いで！',
    '😰 締め切りまであと少し…「${task}」頑張って！'
  ],
  overdue: [
    '💣 もう締め切り過ぎてます！「${task}」今すぐやれ！！',
    '😱 締め切り超過！「${task}」を最優先で！'
  ]
};

// 期限切れ判定
function isOverdue(row) {
  if (!row.date || !row.time) return false;
  const deadline = dayjs(`${row.date} ${row.time}`, 'YYYY-MM-DD HH:mm');
  return deadline.isBefore(dayjs());
}

// 催促メッセージ生成
function getUrgencyMessage(row) {
  const now      = dayjs();
  const deadline = dayjs(`${row.date} ${row.time}`, 'YYYY-MM-DD HH:mm');
  const diffMin  = deadline.diff(now, 'minute');
  let category;
  if (diffMin < 0)        category = 'overdue';
  else if (diffMin <= 10) category = 'near';
  else                     category = 'normal';

  const templates = URGE_PHRASES[category];
  const tpl       = templates[Math.floor(Math.random() * templates.length)];
  return tpl.replace(/\$\{task\}/g, row.task_text);
}

// ===== LINE Webhook =====
app.post('/webhook', line.middleware(config), async (req, res) => {
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text   = event.message.text.trim();
    console.log('[Webhook] text =', text);

    try {
      // --- タスク追加 ---
      if (/^(追加|登録)\s+/.test(text)) {
        const parts = text.replace(/^(追加|登録)\s*/, '').trim().split(/\s+/);
        const taskText = parts[0] || null;
        const datePart = parts[1] || null;
        const timePart = parts[2] || null;

        if (!taskText) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ 内容を指定してください。\n例: 追加 宿題 2025-08-30 21:00'
          });
          continue;
        }

        // 日付未指定は今日に設定
        const today = dayjs().format('YYYY-MM-DD');
        const deadlineDate = datePart || today;
        const deadlineTime = timePart || null;

        // users テーブルからメールアドレスを取得
        let userEmail = null;
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('email')
          .eq('line_user_id', lineUserId)
          .single();

        if (!userError && userData) {
          userEmail = userData.email;
        }

        // todos に保存
        const { error } = await supabase
          .from('todos')
          .insert({
            user_id: lineUserId,
            task: taskText,
            date: deadlineDate,
            time: deadlineTime,
            status: '未完了',
            is_notified: false,
            email: userEmail   // ←ここでセット！
          });

        if (error) throw error;

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🆕 タスク「${taskText}」を登録しました${deadlineTime ? `（締め切り ${deadlineDate} ${deadlineTime}）` : ''}`
        });
        continue;
      }


      // --- メールアドレス登録 ---
      if (/^メールアドレス\s+/.test(text)) {
        const email = text.replace(/^メールアドレス\s*/, '').trim();

        if (!email) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ メールアドレスを入力してください。\n例: メールアドレス sample@example.com'
          });
          continue;
        }

        // users テーブルに保存（存在すれば更新、なければ新規作成）
        const { data: existingUser, error: selectError } = await supabase
          .from('users')
          .select('id')
          .eq('line_user_id', lineUserId)
          .single();

        if (selectError && selectError.code !== 'PGRST116') { // データなし以外はエラー
          throw selectError;
        }

        if (existingUser) {
          // 更新
          const { error: updateError } = await supabase
            .from('users')
            .update({ email })
            .eq('id', existingUser.id);
          if (updateError) throw updateError;

          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `📧 メールアドレスを更新しました: ${email}`
          });
        } else {
          // 新規
          const { error: insertError } = await supabase
            .from('users')
            .insert({ line_user_id: lineUserId, email });
          if (insertError) throw insertError;

          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `📧 メールアドレスを登録しました: ${email}`
          });
        }
        continue;
      }


      // --- 進捗確認 ---
      if (text === '進捗確認') {
        const { data, error } = await supabase
          .from('free_users')
          .select('id, task_text, date, time, done')
          .eq('user_id', userId)
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

        // 1) 一覧を reply
        const lines = data.map(r => {
          const status = r.done ? '✅ 完了' : '⌛ 未完了';
          const dt     = `${r.date || ''} ${r.time || ''}`.trim() || '未定';
          return `🔹 ${r.task_text} - ${dt} [${status}]`;
        });
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: lines.join('\n')
        });

        // 2) 未完了タスクを催促(push)
        for (const row of data) {
          if (!row.done) {
            const urgeMsg = getUrgencyMessage(row);
            await client.pushMessage(userId, {
              type: 'text',
              text: urgeMsg
            });
          }
        }
        continue;
      }

      // --- 締め切り確認 ---
      if (text === '締め切り確認') {
        const { data, error } = await supabase
          .from('free_users')
          .select('id, task_text, date, time, done, is_notified')
          .eq('user_id', userId)
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
          const status = row.done ? '✅ 完了' : '⌛ 未完了';
          const dt     = `${row.date || ''} ${row.time || ''}`.trim() || '未定';
          lines.push(`🔹 ${row.task_text} - ${dt} [${status}]`);

          // 爆撃: 期限超過かつ未通知
          if (isOverdue(row) && !row.done && !row.is_notified) {
            await client.pushMessage(userId, [
              { type: 'text',    text: `💣 タスク「${row.task_text}」の締め切りを過ぎています！` },
              { type: 'sticker', packageId: '446', stickerId: '1988' }
            ]);
            await supabase
              .from('free_users')
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

      // --- 完了 (状態更新) ---
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
          .from('free_users')
          .update({ done: true })
          .eq('task_text', taskName)
          .eq('user_id', userId);
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
          '進捗確認\n' +
          '締め切り確認\n' +
          '完了 タスク名'
      });
    } catch (err) {
      console.error('[Webhook Error]', err);
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `❗️ エラーが発生しました: ${err.message}`
      });
    }
  }
  res.sendStatus(200);
});

// ===== 定期爆撃チェック (毎分) =====
cron.schedule('* * * * *', async () => {
  const { data, error } = await supabase
    .from('free_users')
    .select('id, user_id, task_text, date, time, done, is_notified')
    .eq('done', false)
    .neq('is_notified', true)
    .order('date', { ascending: true })
    .order('time', { ascending: true });

  if (error) {
    console.error('[爆撃チェックエラー]', error);
    return;
  }

  for (const row of data) {
    if (isOverdue(row)) {
      await client.pushMessage(row.user_id, [
        { type: 'text',    text: `💣 まだ終わってないタスク「${row.task_text}」を早くやれ！！` },
        { type: 'sticker', packageId: '446', stickerId: '1988' }
      ]);
      await supabase
        .from('free_users')
        .update({ is_notified: true })
        .eq('id', row.id);
    }
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
