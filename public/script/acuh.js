import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const supabaseUrl = 'https://bteklaezhlfmjylybrlh.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0ZWtsYWV6aGxmbWp5bHlicmxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAzMTEzNDYsImV4cCI6MjA2NTg4NzM0Nn0.8YP7M1soC5NpuuhgtmDUB2cL2y6W3yfmL4rgSxaS0TE'
const supabase = createClient(supabaseUrl, supabaseKey)

const form = document.getElementById('authForm')
const email = document.getElementById('email')
const password = document.getElementById('password')
const message = document.getElementById('message')
const signupBtn = document.getElementById('signupBtn')

// ログイン処理
form.addEventListener('submit', async (e) => {
  e.preventDefault()

  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value
  })

  if (error) {
    message.textContent = 'ログイン失敗: ' + error.message
  } else {
    message.style.color = 'green'
    message.textContent = 'ログイン成功！'
    setTimeout(() => {
      window.location.href = 'Top.html'
    }, 1000)
  }
})

// サインアップ処理
signupBtn.addEventListener('click', async () => {
  const { error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value
  })

  if (error) {
    message.textContent = '登録失敗: ' + error.message
  } else {
    message.style.color = 'green'
    message.textContent = '仮登録完了！確認メールをチェックしてください'
  }
})
