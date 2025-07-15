const axios = require('axios');
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.resolve(__dirname, '../../users.json');

// ここに直接埋め込む（あなたの値に置き換えてください）
const LINE_CHANNEL_ID = 2007711472; // ← 数字のみ
const LINE_CHANNEL_SECRET = 'af69ac093a6180476fbcf5e678e65696';
const LINE_REDIRECT_URI = 'https://tray3forse-linebakugeki.netlify.app/.netlify/functions/callback';
const LINE_MESSAGING_CHANNEL_TOKEN = 'kmPQskBIeKSQmwwFBxBlyXY+ZOZdDlzAgBiKitT8xtgX3B+bGO4fK+0pUswEP2p6l8ObOzM3mY1KTzTJkXMlpl7wavulHH93ty3FwuJz28/jnTVAsA4p7HdHXkBAgAtNSmfPXBFQWUimBcRNq/AFUgdB04t89/1O/w1cDnyilFU=';

exports.handler = async (event, context) => {
  const code = event.queryStringParameters.code;

  try {
    // ① アクセストークン取得
    const tokenRes = await axios.post('https://api.line.me/oauth2/v2.1/token', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: LINE_REDIRECT_URI,
        client_id: LINE_CHANNEL_ID,
        client_secret: LINE_CHANNEL_SECRET,
      },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenRes.data.access_token;

    // ② ユーザー情報取得
    const profileRes = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const userId = profileRes.data.sub;

    // ③ ID保存
    let users = [];
    if (fs.existsSync(USERS_FILE)) {
      users = JSON.parse(fs.readFileSync(USERS_FILE));
    }
    if (!users.includes(userId)) {
      users.push(userId);
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }

    

    // ④ メッセージ送信
    await axios.post('https://api.line.me/v2/bot/message/push', {
      to: userId,
      messages: [{ type: 'text', text: 'こんにちは！ログインありがとう😊' }]
    }, {
      headers: {
        Authorization: `Bearer ${LINE_MESSAGING_CHANNEL_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

// 認証成功後に /top にリダイレクト
return {
  statusCode: 200,
  headers: {
    'Content-Type': 'text/html'
  },
  body: `
    <script>
      window.location.href = 'https://tray3forse-linebakugeki.netlify.app/top';
    </script>
    <p>認証成功！リダイレクト中...</p>
  `
};
    
  } catch (err) {
    console.error(err.response?.data || err.message);
    return {
      statusCode: 500,
      body: 'エラーが発生しました。'
    };
  }
};

