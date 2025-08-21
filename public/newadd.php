<?php
session_start();

if(!isset($_SESSION['email'])) {
  $_SESSION['email'] = ''; 
}

if(isset($_POST['email'])){
  $_SESSION['email'] = $_POST['email'];
  header("Location: Top.php");
  exit();
}
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
      
    </header>

    <div class="container">
      <div class="login-container">
        <h1>📝新規登録</h1>       
        
        <form id="authForm" action="" method="post">
          <div class="form-group">
            <label for="email">メールアドレス</label>
            <input type="email" id="email" name="email" required>
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
