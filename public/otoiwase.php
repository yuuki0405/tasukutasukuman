<?php
session_start();
?>
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>お問い合わせ</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" />
  <link rel="stylesheet" href="css/style6.css" />
  <script defer src="script/otoiawase.js"></script>
</head>
<body class="bg-pink-50 p-6 min-h-screen text-gray-800">

  <header class="header">
    <div class="header-logo">🧠 LINE爆撃くん</div>
    <nav class="nav-menu">
      <ul>
        <li><a href="login.php">📝 新規会員登録/ログイン</a></li>
        <li><a href="Top.php">🏠 ホーム</a></li>
        <li><a href="goningumi.php">👥 グループ情報</a></li>
        <li><a href="mypage.php">👤 マイページ（ユーザー情報）</a></li>
        <li><a href="">🔔 通知キャラ設定ガチャ</a></li>
        <li><p><?php $_SESSION['email'] ?></p></li>
        <li><a href="login.php">ログアウト</a></li>
      </ul>
    </nav>
  </header>

  <form class="contact-form bg-white shadow rounded-xl p-6 space-y-4 max-w-xl mx-auto">
    <div>
      <h1 class="text-2xl font-bold text-pink-600">📨 お問い合わせ</h1>
    <p class="text-sm text-gray-600">ご意見・ご要望・不具合などがあれば以下よりお知らせください。</p>
      <label for="name" class="form-label">お名前</label>
      <input type="text" id="name" name="name" class="form-input" required />
    </div>

    <div>
      <label for="email" class="form-label">メールアドレス</label>
      <input type="email" id="email" name="email" class="form-input" required />
    </div>

    <div>
      <label for="message" class="form-label">お問い合わせ内容</label>
      <textarea id="message" name="message" rows="5" class="form-input" required></textarea>
    </div>

    <button type="submit" class="submit-button">
      📤 送信
    </button>
  </form>
      <!-- ✅ フッターを .wrapper の中に移動 -->
    <footer class="footer">
      <p>&copy; 2025 LINE爆撃くん. All rights reserved.</p>
    </footer>

</body>
</html>
