// URL パラメータから userId を取得
const params = new URLSearchParams(window.location.search);
const userId = params.get('userId');
const grid = document.getElementById('characterGrid');

if (!userId) {
  grid.innerHTML = '<p class="error">ユーザーIDが取得できませんでした。LINEからアクセスしてください。</p>';
  throw new Error('Missing userId');
}

// localStorage から獲得キャラと選択中キャラを取得
const owned = JSON.parse(localStorage.getItem('ownedCharacters') || '[]');
const selectedName = localStorage.getItem('selectedCharacterName');

// 取得キャラがない場合
if (owned.length === 0) {
  grid.innerHTML = '<p>まだキャラクターを獲得していません。</p>';
} else {
  owned.forEach(char => {
    const isSelected = selectedName === char.name;

    const card = document.createElement('div');
    card.className = `card ${isSelected ? 'selected' : ''}`;
    card.innerHTML = `
      <div class="char-name">${char.name}</div>
      <div class="char-rarity">レアリティ: ${char.rarity}</div>
      <button class="select-btn">
        ${isSelected ? '✅ 現在の通知キャラ' : 'このキャラに設定'}
      </button>
    `;

    card.querySelector('.select-btn').addEventListener('click', () => {
      selectCharacter(char.name);
    });

    grid.appendChild(card);
  });
}

/**
 * キャラクター選択時の処理
 */
function selectCharacter(name) {
  localStorage.setItem('selectedCharacterName', name);

  fetch('/api/character-select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, name })
  })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        throw new Error(json.error);
      }
      alert(`${name} を通知キャラに設定しました`);
      location.reload();
    })
    .catch(err => {
      console.error('[Character Select Failed]', err);
      alert('設定に失敗しました。時間をおいて再度お試しください。');
    });
}
```
