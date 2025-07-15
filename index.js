require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');

// 環境変数設定
const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
  // タイムアウト追加
  timeout: 10000
};
const client = new line.Client(config);
const app = express();

// 未処理例外／Promise拒否をキャッチしてログ
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));
app.use(express.json());
app.use(express.static('public'));

// Supabaseクライアント
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// LINE Webhook受信
app.post('/webhook', line.middleware(config), async (req, res) => {
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text = event.message.text.trim();

    // ユーザー設定 upsert
    try {
      await supabase
        .from('user_settings')
        .upsert({ user_id: userId, notify: true });
    } catch (err) {
      console.error('UserSettings upsert failed:', err);
    }

    // 🔗 人格設定リンク
    if (text.includes('人格設定')) {
      try {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: [
            '🔗 人格設定はこちらからどうぞ：',
            'https://tray3forse-linebakugeki.onrender.com/',
            '',
            '現在まだ開発途中の機能も含まれておりますので、',
            '不具合等がございましたらご容赦いただけますと幸いです。'
          ].join('\n')
        });
      } catch (err) {
        console.error('ReplyMessage failed:', err);
      }
      continue;
    }

    // 💣 やってない爆撃
    if (text.includes('やってない')) {
      try {
        await client.replyMessage(event.replyToken, [
          { type: 'text', text: '💣 爆撃1: やってない！？即対応！' },
          { type: 'text', text: '📛 爆撃2: 本気出すタイミングだ！' },
          { type: 'sticker', packageId: '446', stickerId: '1988' }
        ]);
      } catch (err) {
        console.error('ReplyMessage failed:', err);
      }
      continue;
    }

    // 💥 怠惰系爆撃
    if (['めんどくさい','面倒','だるい'].some(w => text.includes(w))) {
      try {
        await client.replyMessage(event.replyToken, [
          { type: 'text', text: '💥 爆撃モード起動！サボりは許されない！' },
          { type: 'text', text: '🔥 めんどくさい？俺の方が10倍めんどくさいBotだぞ？' },
          { type: 'sticker', packageId: '11537', stickerId: '52002736' }
        ]);
      } catch (err) {
        console.error('ReplyMessage failed:', err);
      }
      continue;
    }

    // 👁️ 放置状況トリガー
    if (/放置|状況|時間経過/.test(text)) {
      try {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '📣 Botは見てるぞ…放置されたタスクには爆撃が飛ぶ！7日以上サボったら爆破対象だ💣'
        });
      } catch (err) {
        console.error('ReplyMessage failed:', err);
      }
      continue;
    }

    // ✅ タスク完了（削除）
    if (/完了/.test(text)) {
      const task = text.replace(/^.*完了\s*/, '').trim();
      if (!task) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '⚠️ 完了するタスク名を入力してください！（例: 完了 筋トレ）'
        });
        continue;
      }
      try {
        const { error } = await supabase
          .from('todos')
          .delete()
          .eq('user_id', userId)
          .eq('task', task);
        if (error) throw error;
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `✅ タスク「${task}」を削除したぞ…でも調子に乗るなよ😏`
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
    if (/追加|登録|タスク/.test(text)) {
      const content = text.replace(/^.*(追加|登録|タスク)\s*/, '').trim();
      if (!content || content.length > 200) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '⚠️ タスク内容は200文字以内で入力してください。'
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
    if (/進捗|進捧/.test(text)) {
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
            text: '📭 現在タスクは登録されていません。'
          });
          continue;
        }
        const MAX = 500;
        const lines = data.map(t =>
          `🔹 ${t.task}（${t.date||'未定'} ${t.time||''}） - ${t.status||'未完了'}`
        );
        const chunks = [];
        let acc = '';
        for (const l of lines) {
          if ((acc + '\n' + l).length > MAX) {
            chunks.push(acc);
            acc = l;
          } else {
            acc = acc ? acc + '\n' + l : l;
          }
        }
        if (acc) chunks.push(acc);
        await client.replyMessage(event.replyToken,
          chunks.map(c => ({ type: 'text', text: c }))
        );
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
        '📌 「追加 ○○」「完了 ○○」「進捗確認」「やってない」「めんどくさい」「人格設定」などで使ってね！',
        '',
        '現在まだ開発途中の機能も含まれておりますので、',
        '不具合等がございましたらご容赦いただけますと幸いです。'
      ].join('\n')
    });
  }
  res.sendStatus(200);
});

// 🌐 Webフォームタスク追加
app.post('/add-task', async (req, res) => {
  const { task, deadline, userId } = req.body;
  if (!userId || !task) {
    return res.status(400).json({ error: 'userIdとtaskが必要です' });
  }
  const [date, time] = deadline?.split('T') || [null, null];
  try {
    await supabase.from('user_settings').upsert({ user_id: userId, notify: true });
    const { error } = await supabase.from('todos').insert({
      user_id: userId, task, status: '未完了', date, time
    });
    if (error) throw error;
    const { data: settings } = await supabase
      .from('user_settings').select('notify').eq('user_id', userId).single();
    if (settings?.notify) {
      await client.pushMessage(userId, {
        type: 'text',
        text: `🆕 タスク: ${task}\n締切: ${deadline || '未定'}`
      });
    }
    res.json({ success: true, message: 'タスクを追加しました！' });
  } catch (err) {
    console.error('WebAddTask failed:', err);
    res.status(500).json({ error: '登録失敗: ' + (err.message || err) });
  }
});

// ✅ Expressサーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
