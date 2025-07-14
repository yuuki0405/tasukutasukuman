// キャラ定義（固定データ）
const characters = [
  { name: 'ヤンデレ', id: 'char1', rarity: 2 },
  { name: 'おかま', id: 'char2', rarity: 3 },
  { name: 'ブラック上司', id: 'char3', rarity: 1 },
  { name: '神様', id: 'char4', rarity: 3 },
  { name: '熱血教師', id: 'char5', rarity: 2 },
  { name: '煽り系', id: 'char6', rarity: 1 },
  { name: '母ちゃん', id: 'char7', rarity: 1 }
];

// 現在のガチャ結果
let selectedCharacter = null;

// ガチャ実行
function drawGacha() {
  const result = characters[Math.floor(Math.random() * characters.length)];
  selectedCharacter = result;

  // 表示構築
  const stars = '⭐'.repeat(result.rarity);
  const rarityLabel = result.rarity === 3 ? 'SSR!!' : result.rarity === 2 ? 'SR!' : 'R';
  const rarityLabelClass = result.rarity === 3 ? 'rarity-label-ssr'
                        : result.rarity === 2 ? 'rarity-label-sr'
                        : 'rarity-label-r';

  document.getElementById("gachaResult").innerHTML = `
    <div class="gacha-box">
      <div class="gacha-header ${rarityLabelClass}">
        ${stars} ${rarityLabel}
      </div>
      <div class="gacha-capsule-area">
        <div class="capsule rarity-${result.rarity}"></div>
      </div>
      <div class="gacha-name">${result.name}</div>
    </div>
  `;

  addToOwnedCharacters(result);
}

// 獲得キャラをローカルストレージに保存（重複なし）
function addToOwnedCharacters(character) {
  const owned = JSON.parse(localStorage.getItem('ownedCharacters')) || [];

  if (!owned.find(c => c.id === character.id)) {
    owned.push(character);
    localStorage.setItem('ownedCharacters', JSON.stringify(owned));
  }
}

// 選択保存（通知設定キャラ）
function saveCharacter() {
  if (selectedCharacter) {
    localStorage.setItem("selectedCharacterName", selectedCharacter.name);
    alert(`${selectedCharacter.name} を保存しました！`);
  } else {
    alert('まずガチャを引いてください');
  }
}

// ページ読み込み時：過去保存されたキャラの表示
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('selectedCharacterName');
  if (saved) {
    document.getElementById('selectedText').textContent = `${saved} を以前に選択済み`;
  }
});


