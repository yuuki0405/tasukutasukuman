require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイル
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// LINE Bot設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
  timeout: 10000,
};
const client = new line.Client(config);

// Supabase（Service Role Keyはサーバー専用）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 例外ハンドリング
process.on('uncaughtException', err => console.error('[uncaughtException]', err));
process.on('unhandledRejection', reason => console.error('[unhandledRejection]', reason));

// Body parser
app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));

// LINE Webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const lineUserId = event.source.userId; // LINEユーザーID（UUID型ではない）
    const text = event.message.text.trim();

    try {
      // =========================
      // タスク追加（日付＋時間対応）
      // コマンド例: 「追加 筋トレ 2025-08-30 21:00」
      // =========================
      if (/^(追加|登録)\s+/.test(text)) {
        const parts = text.replace(/^(追加|登録)\s*/, '').trim().split(/\s+/);

        const content = parts[0] || null;
        const datePart = parts[1] || null;
        const timePart = parts[2] || null;

        if (!content) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ タスク内容を指定してください。\n例: 追加 宿題 2025-08-30 21:00'
          });
          continue;
        }

        const today = new Date();
        let deadlineDate = datePart || today.toISOString().split('T')[0];
        let deadlineTime = timePart || null;

        const { data, error } = await supabase
          .from('todos')
          .insert({
            user_id: lineUserId,
            task: content,
            status: '未完了',
            date: deadlineDate,
            time: deadlineTime,
          })
          .select();

        if (error) throw error;

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🆕 タスク「${content}」を登録しました${deadlineTime ? `（締め切り ${deadlineDate} ${deadlineTime}）` : ''}`
        });
        continue;
      }

      // =========================
      // 締め切り確認
      // =========================
      if (text === '締め切り確認') {
        const { data, error } = await supabase
          .from('todos')
          .select('task, date, time, status')
          .eq('user_id', lineUserId)
          .order('date', { ascending: true })
          .order('time', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
          await client.replyMessage(event.replyToken, {
            type: 'text', text: '📭 タスクは登録されていません。'
          });
          continue;
        }

        const lines = data.map(t =>
          `🔹 ${t.task} - ${t.date || '未定'} ${t.time || ''} [${t.status}]`
        );

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: lines.join('\n')
        });
        continue;
      }

      // =========================
      // タスク削除
      // =========================
      if (/^完了\s*/.test(text)) {
        const taskName = text.replace(/^完了\s*/, '').trim();
        if (!taskName) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ 完了するタスク名を指定してください（例: 完了 宿題）'
          });
          continue;
        }

        const { error } = await supabase
          .from('todos')
          .delete()
          .eq('user_id', lineUserId)
          .eq('task', taskName);

        if (error) throw error;

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `✅ タスク「${taskName}」を削除しました。`
        });
        continue;
      }

      // =========================
      // 通常の進捗確認
      // =========================
      if (text === '進捗確認') {
        const { data, error } = await supabase
          .from('todos')
          .select('*')
          .eq('user_id', lineUserId)
          .order('date', { ascending: true })
          .order('time', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
          await client.replyMessage(event.replyToken, { type: 'text', text: '📭 タスクは登録されていません。' });
          continue;
        }

        const lines = data.map(t => `🔹 ${t.task}（${t.date || '未定'} ${t.time || ''}） - ${t.status}`);
        await client.replyMessage(event.replyToken, { type: 'text', text: lines.join('\n') });
        continue;
      }

      // デフォルト応答
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: [
          '📌 コマンド:',
          '・追加 タスク名 [日付] [時間]',
          '・締め切り確認',
          '・完了 タスク名',
          '・進捗確認',
        ].join('\n'),
      });

    } catch (err) {
      console.error('[Webhook Error]', err);
      await client.replyMessage(event.replyToken, { type: 'text', text: `❗️エラー: ${err.message}` });
    }
  }

  res.sendStatus(200);
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
