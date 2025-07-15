// メッセージ処理部分だけ抜粋（前後は同じ）

app.post('/webhook', line.middleware(config), async (req, res) => {
  for (const event of req.body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const userId = event.source.userId;
    const text = event.message.text.trim();

    await supabase.from('user_settings').upsert({ user_id: userId, notify: true });

    // 🧨「やってない」 → 爆撃判定（部分一致）
    if (text.includes('やってない')) {
      const messages = [
        { type: 'text', text: '💣 爆撃1: やってない！？即対応！' },
        { type: 'text', text: '📛 爆撃2: 本気出すタイミングだ！' },
        { type: 'sticker', packageId: '446', stickerId: '1988' }
      ];
      await client.replyMessage(event.replyToken, messages);
      continue;
    }

    // ✅ 部分一致でタスク追加（例：「追加 今日やること」）
    if (text.includes('追加')) {
      const content = text.replace(/^.*追加\s*/, '').trim(); // 「追加」より後ろだけ抽出

      if (!content || content.length > 200) {
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: 'タスク内容を200文字以内で入力してください。'
        });
        continue;
      }

      await supabase.from('todos').insert({
        user_id: userId,
        task: content,
        status: '未完了',
        date: null,
        time: null
      });

      await client.replyMessage(event.replyToken, {
        type: 'text',
        text: `🆕 タスク「${content}」を追加しました！`
      });
      continue;
    }

    // 🔍 進捗確認（そのまま）
    if (text.includes('進捧') || text.includes('進捗確認')) {
      const { data } = await supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      const reply = data?.length
        ? data.map(t => `🔹 ${t.task}（${t.date || '未定'} ${t.time || ''}） - ${t.status}`).join('\n')
        : '📭 現在タスクは登録されていません。';

      await client.replyMessage(event.replyToken, { type: 'text', text: reply });
      continue;
    }

    // ℹ️ その他コマンド案内
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: '📌「追加 ○○」「進捗確認」「やってない」と送ってください！'
    });
  }

  res.sendStatus(200);
});
