<?php
session_start();
?>
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>新規登録 | LINE爆撃くん</title>
  <link rel="stylesheet" href="css/style2.css">
</head>
<body>
  <div class="wrapper">
    <header class="header">
      <div class="header-logo">🧠 LINE爆撃くん</div>
      <nav class="nav-menu">
        <ul>
          <li><a href="">📝 新規会員登録/ログイン</a></li>
          <li><a href="Top.php">🏠 ホーム</a></li>
          <li><a href="goningumi.php">👥 グループ情報</a></li>
          <li><a href="mypage.php">👤 マイページ（ユーザー情報）</a></li>
          <li><a href="zinkaku.php">🔔 通知キャラ設定ガチャ</a></li>
          <li><a href="login.php">ログアウト</a></li>
        </ul>
      </nav>
    </header>

    <div class="container">
      <div class="login-container">
        <h1>📝新規登録</h1>       
        
        <form id="authForm">
          <div class="form-group">
            <label for="email">メールアドレス</label>
            <input type="email" id="email" required>
          </div>
          <div class="form-group">
            <label for="password">パスワード</label>
            <input type="password" id="password" required>
          </div>
          <a href="login.php">ログイン画面へ</a>
          <button type="button" id="signupBtn">サインアップ</button>
        </form>

        <p id="message" style="color: red;">初めての方はサインアップをお願いします！</p>
      </div>
    </div>
  </div>

  <script type="module" src="script/acuh.js"></script>
</body>
</html>
