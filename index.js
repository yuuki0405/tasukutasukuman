  require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Render用：静的ファイルとルート表示対応
app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// LINE Bot設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
  timeout: 10000
};
const client = new line.Client(config);

// Supabase設定
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// グローバル例外処理
process.on('uncaughtException', err => console.error('[uncaughtException]', err));
process.on('unhandledRejection', reason => console.error('[unhandledRejection]', reason));

app.use(bodyParser.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.json());

// 📬 LINE Webhook本体
app.post('/webhook', line.middleware(config), async (req, res) => {
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text = event.message.text.trim();

    try {
      await supabase.from('user_settings').upsert({ user_id: userId, notify: true });

      // 🔗 詳細設定
      if (/詳細設定/.test(text)) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '🔗 詳細設定はこちら：\nhttps://tasukutasukuman.onrender.com/\n\n現在開発中の機能を含みます。不具合ご了承願います。'
        });
        continue;
      }

      // 🔗 人格設定
      if (/人格設定/.test(text)) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '🔗 人格設定はこちら：\nhttps://tray3forse-linebakugeki.onrender.com/\n\n現在開発中の機能を含みます。不具合ご了承願います。'
        });
        continue;
      }

      // 💣 やってない爆撃
      if (/やってない/.test(text)) {
        await client.replyMessage(event.replyToken, [
          { type: 'text', text: '💣 やってない！？即対応しろ！' },
          { type: 'text', text: '📛 今が本気出すタイミングだ！' },
          { type: 'sticker', packageId: '446', stickerId: '1988' }
        ]);
        continue;
      }

      // 💥 怠惰系爆撃
      if (/めんどくさい|面倒|だるい/.test(text)) {
        await client.replyMessage(event.replyToken, [
          { type: 'text', text: '💥 サボりは許さない！爆撃モード発動！' },
          { type: 'text', text: '🔥 めんどい？俺はもっとめんどいぞ！' },
          { type: 'sticker', packageId: '11537', stickerId: '52002736' }
        ]);
        continue;
      }

      // 👁️ 放置トリガー
      if (/放置|状況|時間経過/.test(text)) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '📣 放置されたタスクには爆撃が飛ぶぞ！7日以上は危険領域だ💣'
        });
        continue;
      }

      // ✅ タスク完了
      if (/^完了\s*/.test(text)) {
        const taskName = text.replace(/^完了\s*/, '').trim();
        if (!taskName) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ 完了するタスク名を指定してください（例: 完了 筋トレ）'
          });
          continue;
        }

        const { error } = await supabase
          .from('todos')
          .delete()
          .eq('user_id', userId)
          .eq('task', taskName);
        if (error) throw error;

        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `✅ タスク「${taskName}」を削除しました。`
        });
        continue;
      }

      // 📝 タスク追加
      if (/^(追加|登録)\s+/.test(text)) {
        const content = text.replace(/^(追加|登録)\s*/, '').trim();
        if (!content) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '⚠️ タスク内容を指定してください。'
          });
          continue;
        }

        const { data, error } = await supabase
          .from('todos')
          .insert({
            user_id: userId,
            task: content,
            status: '未完了',
            date: new Date().toISOString().split('T')[0],
            time: null
          })
          .select();
        if (error) throw error;

        const id = data[0]?.id ?? '不明';
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🆕 タスク「${content}」を登録しました！（ID: ${id}）`
        });
        continue;
      }

      // 🔍 進捗確認
      if (text === '進捗確認') {
        const { data, error } = await supabase
          .from('todos')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: true });
        if (error) throw error;

        if (!data || data.length === 0) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '📭 タスクは登録されていません。'
          });
          continue;
        }

        const MAX = 500;
        const lines = data.map(t => `🔹 ${t.task}（${t.date || '未定'}） - ${t.status}`);
        const chunks = [];
        let buffer = '';

        for (const lineText of lines) {
          if ((buffer + '\n' + lineText).length > MAX) {
            chunks.push(buffer);
            buffer = lineText;
          } else {
            buffer += buffer ? '\n' + lineText : lineText;
          }
        }
        if (buffer) chunks.push(buffer);

        const msgs = chunks.map(c => ({ type: 'text', text: c }));
        await client.replyMessage(event.replyToken, msgs);
        continue;
      }

      // ℹ️ その他案内
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: [
          '📌 使い方:',
          '・追加 タスク内容',
          '・完了 タスク名',
          '・進捗確認',
          '・詳細設定／人格設定',
          '・やってない／めんどくさい',
          '',
          '開発中の機能が含まれます。不具合ご了承願います。'
        ].join('\n')
      });
    } catch (err) {
      console.error('[Webhook Error]', err);
    }
  }

  res.sendStatus(200);
});

// ✅ サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`[DEBUG] Supabase URL: ${process.env.SUPABASE_URL || '未設定'}`);
});
