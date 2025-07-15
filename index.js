require('dotenv').config();

const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};
const client = new line.Client(config);
const app = express();

app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf.toString(); }
}));
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 📬 LINEメッセージ受付
app.post('/webhook', line.middleware(config), async (req, res) => {
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text = event.message.text.trim();

    // 常にユーザー設定テーブルに upsert（通知許可フラグ永続化）
    await supabase
      .from('user_settings')
      .upsert({ user_id: userId, notify: true });

    // 🔗 「人格設定」のキーワードでリンク誘導
    if (text.includes('人格設定')) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '🔗 人格設定はこちらからどうぞ：\nhttps://tray3forse-linebakugeki.onrender.com/'
      });
      continue;
    }

    // 💣 「やってない」爆撃
    if (text.includes('やってない')) {
      await client.replyMessage(event.replyToken, [
        { type: 'text', text: '💣 爆撃1: やってない！？即対応！' },
        { type: 'text', text: '📛 爆撃2: 本気出すタイミングだ！' },
        { type: 'sticker', packageId: '446', stickerId: '1988' }
      ]);
      continue;
    }

    // 💥 怠惰系爆撃：「めんどくさい」「面倒」「だるい」
    if (
      text.includes('めんどくさい') ||
      text.includes('面倒') ||
      text.includes('だるい')
    ) {
      await client.replyMessage(event.replyToken, [
        { type: 'text', text: '💥 爆撃モード起動！サボりは許されない！' },
        { type: 'text', text: '🔥 めんどくさい？俺の方が10倍めんどくさいBotだぞ？' },
        { type: 'sticker', packageId: '11537', stickerId: '52002736' }
      ]);
      continue;
    }

    // 👁️ 放置状況トリガー：「放置」「状況」「時間経過」
    if (/放置|状況|時間経過/.test(text)) {
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: '📣 Botは見てるぞ…放置されたタスクには爆撃が飛ぶ！7日以上サボったら爆破対象だ💣'
      });
      continue;
    }

    // ✅ タスク完了 → 削除処理
    if (/完了/.test(text)) {
      const taskToDelete = text.replace(/^.*完了\s*/, '').trim();
      if (!taskToDelete) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '⚠️ 完了するタスク名を入力してください！（例: 完了 筋トレ）'
        });
        continue;
      }

      const { error } = await supabase
        .from('todos')
        .delete()
        .eq('user_id', userId)
        .eq('task', taskToDelete);

      if (error) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `🚫 削除失敗: ${error.message}`
        });
      } else {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `✅ タスク「${taskToDelete}」を削除したぞ…でも調子に乗るなよ😏`
        });
      }
      continue;
    }

    // 📝 タスク追加：「追加」「登録」「タスク」
    if (/追加|登録|タスク/.test(text)) {
      const taskContent = text.replace(/^.*(追加|登録|タスク)\s*/, '').trim();
      if (!taskContent || taskContent.length > 200) {
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
            task: taskContent,
            status: '未完了',
            date: new Date().toISOString().split('T')[0],
            time: null
          })
          .select();

        if (error) {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `🚫 登録失敗: ${error.message}`
          });
        } else {
          const id = data?.[0]?.id ?? '不明';
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `🆕 タスク「${taskContent}」を登録しました！（ID: ${id}）`
          });
        }
      } catch (err) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: `⚠️ 登録処理中にエラー発生しました：${err.message}`
        });
      }
      continue;
    }

    // 🔍 進捗確認：「進捗」「進捧」
    if (text.includes('進捗') || text.includes('進捧')) {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (error || !data || data.length === 0) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '📭 現在タスクは登録されていません。'
        });
        continue;
      }

      const MAX_LENGTH = 500;
      const lines = data.map(t => {
        const date = t.date || '未定';
        const time = t.time || '';
        const status = t.status || '未完了';
        return `🔹 ${t.task}（${date} ${time}） - ${status}`;
      });

      const chunks = [];
      let chunk = '';
      for (const line of lines) {
        if ((chunk + '\n' + line).length > MAX_LENGTH) {
          chunks.push(chunk);
          chunk = line;
        } else {
          chunk += chunk ? '\n' + line : line;
        }
      }
      if (chunk) chunks.push(chunk);

      const messages = chunks.map(c => ({ type: 'text', text: c }));
      await client.replyMessage(event.replyToken, messages);
      continue;
    }

    // ℹ️ その他案内
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📌 「追加 ○○」「完了 ○○」「進捗確認」「やってない」「めんどくさい」「人格設定」などで使ってね！'
    });
  }
  res.sendStatus(200);
});

// 🌐 Webフォームからのタスク追加
app.post('/add-task', async (req, res) => {
  const { task, deadline, userId } = req.body;
  if (!userId || !task) {
    return res.status(400).json({ error: 'userIdとtaskが必要です' });
  }

  const [date, time] = deadline?.split('T') || [null, null];

  await supabase
    .from('user_settings')
    .upsert({ user_id: userId, notify: true });

  const { error } = await supabase
    .from('todos')
    .insert({ user_id, task, status: '未完了', date, time });

  if (error) {
    return res.status(500).json({ error: '登録失敗' });
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('notify')
    .eq('user_id', userId)
    .single();

  if (settings?.notify) {
    await client.pushMessage(userId, {
      type: 'text',
      text: `🆕 タスク: ${task}\n締切: ${deadline || '未定'}`
    });
  }

  res.json({ success: true, message: 'タスクを追加しました！' });
});

// ✅ Expressサーバー起動（必須）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
