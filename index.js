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

// Supabase設定
// サービスロールキーはサーバー側だけで安全に保持
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

    const lineUserId = event.source.userId; // LINEのユーザーID（UUID型ではない）
    const text = event.message.text.trim();

    try {
      // 開発簡易: LINE ID を user_id にそのまま保存する場合はテーブル側をTEXT型に
      // UUID型で運用するなら、ここでSupabase Authとの紐付けが必要

      // タスク追加
      if (/^(追加|登録)\s+/.test(text)) {
        const content = text.replace(/^(追加|登録)\s*/, '').trim();
        if (!content) {
          await client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ タスク内容を指定してください。' });
          continue;
        }

        const { data, error } = await supabase
          .from('todos')
          .insert({
            user_id: lineUserId, // TEXT型ならOK、UUID型なら事前変換orAuthUIDに
            task: content,
            status: '未完了',
            date: new Date().toISOString().split('T')[0],
            time: null,
          })
          .select();

        if (error) throw error;

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🆕 タスク「${content}」を登録しました！（ID: ${data[0]?.id ?? '不明'}）`,
        });
        continue;
      }

      // 進捗確認
      if (text === '進捗確認') {
        const { data, error } = await supabase
          .from('todos')
          .select('*')
          .eq('user_id', lineUserId)
          .order('date', { ascending: true });

        if (error) throw error;
        if (!data || data.length === 0) {
          await client.replyMessage(event.replyToken, { type: 'text', text: '📭 タスクは登録されていません。' });
          continue;
        }

        const lines = data.map(t => `🔹 ${t.task}（${t.date || '未定'}） - ${t.status}`);
        await client.replyMessage(event.replyToken, { type: 'text', text: lines.join('\n') });
        continue;
      }

      // タスク削除
      if (/^完了\s*/.test(text)) {
        const taskName = text.replace(/^完了\s*/, '').trim();
        if (!taskName) {
          await client.replyMessage(event.replyToken, { type: 'text', text: '⚠️ 完了するタスク名を指定してください。' });
          continue;
        }

        const { error } = await supabase
          .from('todos')
          .delete()
          .eq('user_id', lineUserId)
          .eq('task', taskName);

        if (error) throw error;
        await client.replyMessage(event.replyToken, { type: 'text', text: `✅ タスク「${taskName}」を削除しました。` });
        continue;
      }

      // デフォルト応答
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '📌 コマンド:\n追加 タスク名\n完了 タスク名\n進捗確認',
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
