import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const supabase = createClient(
  'https://bteklaezhlfmjylybrlh.supabase.co',
  'YOUR_ANON_KEY'
)

document.getElementById('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault()
  const taskText = document.getElementById('taskInput').value.trim()
  const date = document.getElementById('dateInput').value
  const time = document.getElementById('timeInput').value

  if (!taskText || !date || !time) {
    document.getElementById('message').textContent = '全ての項目を入力してください。'
    return
  }

  // date と time を ISO 形式にマージ
  const dateTime = `${date}T${time}`

  const { data, error } = await supabase
    .from('todos')
    .insert([{ task_text: taskText, date_time: dateTime, done: false }])

  if (error) {
    document.getElementById('message').textContent = '追加失敗: ' + error.message
  } else {
    document.getElementById('message').textContent = '追加完了！'
    e.target.reset()
    loadTasks()
  }
})

async function loadTasks() {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .order('date_time', { ascending: true })

  if (error) {
    document.getElementById('message').textContent = '読み込み失敗: ' + error.message
    return
  }
  renderTasks(data)
}


// タスクを表示
function renderTasks(tasks) {
  taskList.innerHTML = ''
  if (tasks.length === 0) {
    taskList.innerHTML = '<p>まだタスクがありません。</p>'
    return
  }

  tasks.forEach(task => {
    const div = document.createElement('div')
    div.className = 'task'
    div.innerHTML = `
      <div class="task-content">
        <strong>${task.task}</strong><br>
        <small>締切: ${task.date} ${task.time}</small>
      </div>
      <button class="delete" data-id="${task.id}">削除</button>
    `
    taskList.appendChild(div)

    // 通知予約（5分前）
    const deadline = new Date(`${task.date}T${task.time}`)
    const notifyTime = new Date(deadline.getTime() - 5 * 60 * 1000)
    const now = new Date()
    const timeout = notifyTime - now
    if (timeout > 0) {
      setTimeout(() => sendNotification(task), timeout)
    }
  })

  // 削除イベント
  document.querySelectorAll('.delete').forEach(button => {
    button.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id')
      await deleteTask(id)
    })
  })
}

// タスク削除
async function deleteTask(id) {
  const { error } = await supabase.from('todos').delete().eq('id', id)
  if (error) {
    alert('削除失敗: ' + error.message)
  } else {
    loadTasks()
  }
}

// 通知を送信
function sendNotification(task) {
  if (Notification.permission === 'granted') {
    new Notification('⏰ タスクの時間です', {
      body: `${task.task}（${task.date} ${task.time}）`,
      icon: 'icon.png'
    })
  }
}

// タスク追加
document.getElementById('taskForm').addEventListener('submit', async (e) => {
  e.preventDefault()

  const task = taskInput.value.trim()
  const date = dateInput.value
  const time = timeInput.value

  if (!task || !date || !time) {
    message.textContent = '全ての項目を入力してください。'
    return
  }

  const { error } = await supabase.from('todos').insert({
    task,
    date,
    time
  })

  if (error) {
    message.textContent = '追加失敗: ' + error.message
  } else {
    message.textContent = '追加完了！'
    taskInput.value = ''
    dateInput.value = ''
    timeInput.value = ''
    loadTasks()
  }
})

// 通知許可
if (Notification.permission !== 'granted') {
  Notification.requestPermission()
}

// 初期表示
document.addEventListener('DOMContentLoaded', loadTasks)
