(() => {
  const USER_ID = window.currentUserId;
  const form = document.getElementById('taskForm');
  const msg  = document.getElementById('message');
  const list = document.getElementById('taskList');

  async function loadTasks() {
    try {
      const res = await fetch(`/get-tasks?userId=${USER_ID}`);
      const { tasks } = await res.json();
      list.innerHTML = tasks.map(t => `<li>${t.task}（${t.date || '未定'} ${t.time || ''}）</li>`).join('');
    } catch {
      list.innerHTML = '<li>リスト取得エラー</li>';
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const task  = form.task.value.trim();
    const date  = form.date.value;
    const time  = form.time.value;
    const deadline = date && time ? `${date} ${time}` : '';

    try {
      const res = await fetch('/add-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID, task, deadline })
      });
      const json = await res.json();
      msg.textContent = json.success ? 'タスク内容が追加されました！' : json.error;
      form.reset();
      await loadTasks();
    } catch {
      msg.textContent = '通信エラー';
    }
    setTimeout(() => { msg.textContent = '' }, 3000);
  });

  loadTasks();
})();
