require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');

// LINE／Supabase 共通設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
  timeout: 10000
};
const client = new line.Client(config);
const app = express();

// 未処理例外・Promise拒否をログ
process.on('uncaughtException', err => console.error('[uncaughtException]', err));
process.on('unhandledRejection', reason => console.error('[unhandledRejection]', reason));

app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf.toString(); } }));
app.use(express.json());
app.use(express.static('public'));

// Supabaseクライアント
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 📬 LINE Webhook
app.post('/webhook', line.middleware(config), async (req, res) => {
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text = event.message.text.trim();

    // 通知設定を upsert
    try {
      await supabase.from('user_settings').upsert({ user_id: userId, notify: true });
    } catch (err) {
      console.error('UserSettings upsert failed:', err);
    }

    // 🔧 詳細設定リンク
    if (text.includes('詳細設定')) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: [
          '🔗 詳細設定はこちら：',
          'https://tasukutasukuman.onrender.com/',
          '',
          '現在開発中の機能を含みます。不具合ご了承願います。'
        ].join('\n')
      }).catch(err => console.error('ReplyMessage failed:', err));
      continue;
    }

    // 🔗 人格設定リンク
    if (text.includes('人格設定')) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: [
          '🔗 人格設定はこちら：',
          'https://tray3forse-linebakugeki.onrender.com/',
          '',
          '現在開発中の機能を含みます。不具合ご了承願います。'
        ].join('\n')
      }).catch(err => console.error('ReplyMessage failed:', err));
      continue;
    }

    // 💣 やってない爆撃
    if (text.includes('やってない')) {
      await client.replyMessage(event.replyToken, [
        { type: 'text', text: '💣 やってない！？即対応しろ！' },
        { type: 'text', text: '📛 今が本気出すタイミングだ！' },
        { type: 'sticker', packageId: '446', stickerId: '1988' }
      ]).catch(err => console.error('ReplyMessage failed:', err));
      continue;
    }

    // 💥 怠惰系爆撃
    if (/めんどくさい|面倒|だるい/.test(text)) {
      await client.replyMessage(event.replyToken, [
        { type: 'text', text: '💥 サボりは許さない！爆撃モード発動！' },
        { type: 'text', text: '🔥 めんどい？俺はもっとめんどいぞ！' },
        { type: 'sticker', packageId: '11537', stickerId: '52002736' }
      ]).catch(err => console.error('ReplyMessage failed:', err));
      continue;
    }

    // 👁️ 放置状況トリガー
    if (/放置|状況|時間経過/.test(text)) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '📣 放置タスクには爆撃が飛ぶぞ！7日以上は要注意💣'
      }).catch(err => console.error('ReplyMessage failed:', err));
      continue;
    }

    // ✅ タスク完了（削除）
    if (/^完了/.test(text)) {
      const taskName = text.replace(/^完了\s*/, '').trim();
      if (!taskName) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '⚠️ 完了するタスク名を指定してください（例: 完了 筋トレ）'
        });
        continue;
      }
      try {
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
      } catch (err) {
        console.error('DeleteTask failed:', err);
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🚫 削除失敗: ${err.message || err}`
        });
      }
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
      try {
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
      } catch (err) {
        console.error('InsertTask failed:', err);
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🚫 登録失敗: ${err.message || err}`
        });
      }
      continue;
    }

    // 🔍 進捗確認
    if (text === '進捗確認') {
      try {
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
        let chunk = '';
        for (const lineText of lines) {
          if ((chunk + '\n' + lineText).length > MAX) {
            chunks.push(chunk);
            chunk = lineText;
          } else {
            chunk += chunk ? '\n' + lineText : lineText;
          }
        }
        if (chunk) chunks.push(chunk);
        const msgs = chunks.map(c => ({ type: 'text', text: c }));
        await client.replyMessage(event.replyToken, msgs);
      } catch (err) {
        console.error('FetchTasks failed:', err);
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🚫 進捗取得失敗: ${err.message || err}`
        });
      }
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
        '開発途中の機能を含みます。不具合ご了承願います。'
      ].join('\n')
    });
  }

  res.sendStatus(200);
});

// Expressサーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
