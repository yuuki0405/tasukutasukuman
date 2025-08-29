// このスクリプトは <script type="module"> で読み込んでください
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

// ▼ あなたのSupabase URL/Anonキーに置き換えてください（ブラウザは anon キー）
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const taskInput  = document.getElementById('taskInput')
const dateInput  = document.getElementById('dateInput')
const timeInput  = document.getElementById('timeInput')
const taskList   = document.getElementById('taskList')
const message    = document.getElementById('message')
const form       = document.getElementById('taskForm')

// 初期表示
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try { await Notification.requestPermission() } catch {}
  }
  loadTasks()
})

// タスク一覧（未完了のみ）
async function loadTasks() {
  if (!window.userEmail) {
    console.warn('window.userEmail が未設定です。ログイン後にセットしてください。')
  }

  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('email', window.userEmail)
    .eq('status', '未完了')                 // 未完了のみ
    .order('date', { ascending: true })
    .order('time', { ascending: true })

  if (error) {
    console.error('読み込み失敗:', error.message)
    message.textContent = 'タスクの読み込みに失敗しました。'
    message.classList.add('error')
    return
  }

  renderTasks(data || [])
}

// タスク描画
function renderTasks(tasks) {
  taskList.innerHTML = ''
  if (tasks.length === 0) {
    taskList.innerHTML = '<p>まだタスクがありません。</p>'
    return
  }

  for (const task of tasks) {
    const div = document.createElement('div')
    div.className = 'task'
    div.innerHTML = `
      <div class="task-content">
        <strong>${escapeHtml(task.task)}</strong><br>
        <small>状態: ${task.status} ｜ 締切: ${task.date} ${task.time}</small>
      </div>
      <button class="complete" data-id="${task.id}">完了</button>
    `
    taskList.appendChild(div)

    // 5分前通知（未通知のみ予約）
    const deadline = new Date(`${task.date}T${task.time}`)
    const notifyTime = new Date(deadline.getTime() - 5 * 60 * 1000)
    const now = new Date()
    const timeout = notifyTime - now
    if (!task.is_notified && timeout > 0 && typeof Notification !== 'undefined') {
      setTimeout(() => sendNotification(task), timeout)
    }
  }

  // 完了ボタン
  taskList.querySelectorAll('.complete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id')
      await completeTask(id)
    })
  })
}

// タスク「完了」更新
async function completeTask(id) {
  const { error } = await supabase
    .from('todos')
    .update({ status: '完了' })
    .eq('id', id)

  if (error) alert('更新失敗: ' + error.message)
  else loadTasks()
}

// 通知＆通知済みに更新
async function sendNotification(task) {
  try {
    if (Notification.permission === 'granted') {
      new Notification('⏰ タスクの時間です', {
        body: `${task.task}（${task.date} ${task.time}）`,
        icon: 'icon.png'
      })
    }
    await supabase.from('todos')
      .update({ is_notified: true })
      .eq('id', task.id)
  } catch (e) {
    console.warn('通知処理エラー:', e)
  }
}

// 追加（常に未完了）
form.addEventListener('submit', async (e) => {
  e.preventDefault()

  const task = taskInput.value.trim()
  const date = dateInput.value
  const time = timeInput.value

  if (!task || !date || !time) {
    message.textContent = '全ての項目を入力してください。'
    message.classList.add('error')
    return
  }

  const { error } = await supabase.from('todos').insert([{
    task,
    date,
    time,
    status: '未完了',
    is_notified: false,
    email: window.userEmail
  }])

  if (error) {
    message.textContent = '追加失敗: ' + error.message
    message.classList.add('error')
  } else {
    message.textContent = '追加完了！'
    message.classList.remove('error')
    taskInput.value = ''
    dateInput.value = ''
    timeInput.value = ''
    loadTasks()
  }
})

// 簡易XSS対策
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
