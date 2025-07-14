// まずlocalStorageから獲得済みキャラを取得
const owned = JSON.parse(localStorage.getItem('ownedCharacters') || '[]');
const selectedName = localStorage.getItem("selectedCharacterName");
const grid = document.getElementById("characterGrid");

// キャラがいない場合のメッセージ
if (owned.length === 0) {
  grid.innerHTML = "<p>まだキャラクターを獲得していません。</p>";
} else {
  owned.forEach(char => {
    const isSelected = selectedName === char.name;
    const card = document.createElement("div");
    card.className = `card ${isSelected ? "selected" : ""}`;

    card.innerHTML = `
      <div class="char-name">${char.name}</div>
      <div class="char-rarity">レアリティ: ${char.rarity}</div>
      <button onclick="selectCharacter('${char.name}')">
        ${isSelected ? "✅ 現在の通知キャラ" : "このキャラに設定"}
      </button>
    `;
    grid.appendChild(card);
  });
}

// キャラ選択ボタンの処理
function selectCharacter(name) {
  localStorage.setItem("selectedCharacterName", name);
  alert(`${name} を通知キャラに設定しました`);
  location.reload();
}
