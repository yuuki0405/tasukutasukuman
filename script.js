const params = new URLSearchParams(window.location.search);
const userId = params.get('userId');

if (!userId) {
  document.body.innerHTML = '<h2>❗️URLに userId が必要です</h2>';
  throw new Error('userId missing');
}

document.getElementById('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const task = document.getElementById('taskInput').value;
  const date = document.getElementById('dateInput').value;
  const time = document.getElementById('timeInput').value;

  await fetch('/add-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, task, date, time })
  });

  document.getElementById('taskForm').reset();
  loadTasks();
});

async function loadTasks() {
  const res = await fetch(`/get-tasks?userId=${userId}`);
  const { tasks } = await res.json();
  const list = document.getElementById('taskList');
  list.innerHTML = tasks.length
    ? tasks.map(t => `<li>${t.task}（${t.date || '未定'} ${t.time || ''}）</li>`).join('')
    : '<li>📭 タスクはありません。</li>';
}

loadTasks();
