const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

const config = {
  channelAccessToken: 'LINE_CHANNEL_ACCESS_TOKEN',
  channelSecret: 'LINE_CHANNEL_SECRET'
};

const supabase = createClient(
  'https://bteklaezhlfmjylybrlh.supabase.co',
  'SUPABASE_SERVICE_ROLE_KEY' // サーバー用のキー
);

const client = new line.Client(config);
const app = express();

app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;
  for (const event of events) {
    if (event.type === 'message' && event.message.text === '進捗確認') {
      // タスク一覧を取得
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('date', { ascending: true });

      let replyText = '';
      if (error || !data || data.length === 0) {
        replyText = 'タスクはありません。';
      } else {
        replyText = data.map(t =>
          `・${t.task}（${t.date} ${t.time}）`
        ).join('\n');
      }

      // LINEに返信
      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: replyText
      });
    }
  }
  res.sendStatus(200);
});

app.listen(3000);
