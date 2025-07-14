<?php
session_start();
?>
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>通知キャラ・ガチャ選択</title>
  <link rel="stylesheet" href="css/style5.css">
</head>
<body>
  <!-- ヘッダー -->
  <header class="header">
    <div class="header-logo">🧠 LINE爆撃くん</div>
    <nav class="nav-menu">
      <ul>
        <li><a href="login.php">📝 新規会員登録/ログイン</a></li>
        <li><a href="Top.php">🏠 ホーム</a></li>
        <li><a href="goningumi.php">👥 グループ情報</a></li>
        <li><a href="mypage.php">👤 マイページ（ユーザー情報）</a></li>
        <li><a href="zinkaku.php">🔔 通知キャラ設定ガチャ</a></li>
        <li><p><?php $_SESSION['email'] ?></p></li>
        <li><a href="login.php">🚪 ログアウト</a></li>
      </ul>
    </nav>
  </header>

  <!-- メインコンテンツ -->
  <div class="wrapper">
    <div class="gacha-container">
      <!-- タイトル -->
      <div class="white-box">
        <h1 class="gacha-title">🎰 通知キャラクター・ガチャ</h1>
      </div>

      <!-- ガチャボタンと結果表示 -->
      <div class="gacha-center-wrapper">
        <button class="gacha-btn" onclick="drawGacha()">ガチャを引く</button>
        <div id="gachaResult" class="gacha-result"></div>
      </div>

      <!-- タスク達成と保存 -->
      <div class="white-box fullscreen">
        <div class="task-progress">
          <p>タスク達成ポイント：<span id="taskCount">0</span> / 5</p>
          <button id="testCompleteTask" class="test-task-btn">✅ タスク達成（テスト）</button>
        </div>

        <button class="save-btn" onclick="saveCharacter()">選択を保存</button>
        <div id="selectedText" class="selected-text"></div>
      </div>
    </div>
  </div>

  <!-- JavaScriptの読み込み -->
  <script src="script/character.js"></script>
</body>
</html>
