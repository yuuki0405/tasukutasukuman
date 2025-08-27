<?php
session_start();

if (empty($_SESSION['email'])) {
    header("Location: login.php");
    exit();
}

$email = $_SESSION['email']; // ← ここで変数に格納
?>
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>タスク追加 | LINE爆撃くん</title>
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <div class="wrapper">
    <header class="header">
      <div class="header-logo">🧠 LINE爆撃くん</div>
      <nav class="nav-menu">
        <ul>
          <li><a href="Top.php">🏠 ホーム</a></li>
          <li><p><?php echo htmlspecialchars($_SESSION['email']); ?></p></li>
          <li><a href="login.php">ログアウト</a></li>
        </ul>
      </nav>
    </header>

    <main class="container">
      <h1>タスク追加</h1>
      <form id="taskForm">
        <label>
          タスク名：
          <input type="text" id="taskInput" placeholder="やることを入力..." required />
        </label>
        <br />
        <label>
          締切日：
          <input type="date" id="dateInput" required />
        </label>
        <br />
        <label>
          締切時間：
          <input type="time" id="timeInput" required />
        </label>
        <br />
        <button type="submit">追加</button>
      </form>

      <a href="https://line.me/R/ti/p/%40578xtcun" target="_blank">
        <img src="https://scdn.line-apps.com/n/line_add_friends/btn/ja.png" alt="LINEで友だち追加">
      </a>

      <p id="message" style="color:red;"></p>

      <h2>タスク一覧</h2>
      <div id="taskList"></div>

    </main>
  </div>

  <!-- ✅ PHPからJSへセッション変数を埋め込む -->
  <script>
    window.userEmail = "<?php echo htmlspecialchars($email, ENT_QUOTES, 'UTF-8'); ?>";
  </script>

  <script type="module" src="script/script.js"></script>
</body>
</html>
