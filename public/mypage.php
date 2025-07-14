<?php
session_start();
?>
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>マイページ</title>
  <link rel="stylesheet" href="css/style3.css">
  <script defer src="script/mypage.js"></script>
</head>
<body class="bg-pink-50 p-6 min-h-screen text-gray-800">

<!-- ヘッダー -->
<div class="wrapper">
        <header class="header">
            <div class="header-logo">🧠 LINE爆撃くん</div>
            <nav class="nav-menu">
            <ul>
              <li><a href="login.php">📝 新規会員登録/ログイン</a></li>
              <li><a href="Top.php">🏠 ホーム</a></li>
              <li><a href="goningumi.php">👥 グループ情報</a></li>
              <li><a href="">👤 マイページ（ユーザー情報）</a> </li>
              <li><a href="zinkaku.php">🔔 通知キャラ設定ガチャ</a> </li>
              <li><p><?php $_SESSION['email'] ?></p></li>
              <li><a href="login.php">ログアウト</a> </li>
            </ul>
            </nav>
        </header>

<!-- プロフィール -->
<section class="bg-white shadow rounded-xl p-5 mb-6 flex items-center space-x-4">
   <h2 class="text-lg font-bold text-pink-600 mb-2">👤 プロフィール</h2>
   <div id="selectedIconWrapper">
    <img id="selectedIconImage" src="icons/black_boss.png" alt="選択アイコン" class="w-12 h-12 rounded-full border" />
  </div>
  <div>
    <label for="username" class="text-sm text-gray-600">ユーザー名</label><br />
    <input id="username" type="text" placeholder="ユーザー名を入力" 
           class="border rounded px-2 py-1 text-xl font-bold w-48" />
            <li><a href="characters.php">🙎キャラクター選択画面</a> </li>
    <p id="character-display" class="text-pink-500 text-sm mt-1">通知キャラ：読み込み中...</p>
  </div>
  <button id="save-user-btn" class="ml-auto bg-pink-400 text-white px-4 py-1 rounded-full hover:bg-pink-500 text-sm">⚙️ 設定</button>
</div>
</div>
</section>

<!-- 通知ログ -->
<section class="bg-white shadow rounded-xl p-5 mb-6">
  <h2 class="text-lg font-bold text-pink-600 mb-2">🔔 通知履歴／圧ログ</h2>
  <ul id="log-list" class="list-disc list-inside text-sm space-y-1"></ul>
</section>

<!-- スコア -->
<section class="bg-white shadow rounded-xl p-5 text-center">
  <h2 class="text-lg font-bold text-pink-600 mb-2">🏆 サボりスコア</h2>
  <p class="text-lg">🔥 サボり日数：<span class="font-bold">28日</span></p>
  <p class="text-sm text-gray-600">🐾 圧かけられ回数：<span class="font-semibold">12回</span></p>
</section>

</body>
</html>
