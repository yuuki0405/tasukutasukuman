const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const USERS_FILE = path.resolve(__dirname, '../../users.json');

exports.handler = async (event, context) => {
  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  const body = JSON.parse(event.body || '{}');
  const message = body.message || 'こんにちは！';

  try {
    for (const userId of users) {
      await axios.post('https://api.line.me/v2/bot/message/push', {
        to: userId,
        messages: [{ type: 'text', text: message }]
      }, {
        headers: {
          Authorization: `Bearer ${process.env.LINE_MESSAGING_CHANNEL_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
    }

    return {
      statusCode: 200,
      body: '全ユーザーに送信しました'
    };
  } catch (err) {
    console.error(err.response?.data || err.message);
    return {
      statusCode: 500,
      body: '送信エラー'
    };
  }
};
