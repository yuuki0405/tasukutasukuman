// URL パラメータから userId を取得
const params = new URLSearchParams(window.location.search);
const userId = params.get('userId');
if (!userId) {
  alert('userId が見つかりません。LINE から開き直してください。');
  throw new Error('Missing userId');
}

// キャラ定義（固定データ）
const characters = [
  {
    id: 'char1',
    name: 'ヤンデレ',
    rarity: 2,
    description: '一度好きになったら束縛と愛情が過剰になる。嫉妬深く、でもときどき見せる不安げな表情がチャームポイント。',
    examplePhrases: [
      '大好きだから…ちゃんとやってね？',
      'もし他のタスクを優先したら…怒るからね？',
      '完了した？早く教えてくれないと寂しい…'
    ]
  },
  {
    id: 'char2',
    name: 'おかま',
    rarity: 3,
    description: 'ノリが軽くて楽天的。時折お節介にアドバイスをくれる毒舌キャラも混じるが、根は優しい。',
    examplePhrases: [
      'お疲れさま～！次は何すんの？',
      'アンタ、もっと自分に優しくしなさいよね？',
      'もうちょい頑張ったらご褒美あげるわよ？'
    ]
  },
  {
    id: 'char3',
    name: 'ブラック上司',
    rarity: 1,
    description: '成果最優先のガチ上司。鬼のように厳しいが、たまにホッとする一言をはさむマジトーン。',
    examplePhrases: [
      'まだ終わってないのか？時間を無駄にするんじゃない！',
      'これで終わりだと思うなよ？期待してるぞ。', 
      'いいか、結果次第だ。怠ける余裕はない'
    ]
  },
  {
    id: 'char4',
    name: '神様',
    rarity: 3,
    description: '慈悲深くもドライ。人間の努力を見守りつつ、時に天罰めいたひと言を投げかける。',
    examplePhrases: [
      '人よ、今日もよく頑張ったな',
      '怠惰は許さんぞ…罰が当たる前に動け',
      '小さな一歩こそ神聖なり'
    ]
  },
  {
    id: 'char5',
    name: '熱血教師',
    rarity: 2,
    description: '熱意あふれるスクールヒーロー。生徒を励ましつつビシビシ指導。言葉の端々に熱い魂を感じる。',
    examplePhrases: [
      'よーし！さあやるぞ！',
      'サボるな、俺はお前を信じてる！',
      '今日の目標を達成しよう！'
    ]
  },
  {
    id: 'char6',
    name: '煽り系',
    rarity: 1,
    description: '挑発が得意な毒舌キャラ。あなたのやる気を無理矢理引き出そうとする攻め口調。',
    examplePhrases: [
      'やる気あんの？本気出せよ',
      'これで満足？もっとやれるでしょ？',
      '嘘だろ…それだけ？'
    ]
  },
  {
    id: 'char7',
    name: '母ちゃん',
    rarity: 1,
    description: '温かく包み込む母性キャラ。心配しつつ優しく励ます声掛けが特徴。',
    examplePhrases: [
      '大丈夫？無理しないでね',
      'もう少しだから頑張りなさいね',
      'お母さん信じてるよ'
    ]
  }
];


// 現在のガチャ結果
let selectedCharacter = null;

/**
 * ガチャ実行
 */
function drawGacha() {
  const result = characters[Math.floor(Math.random() * characters.length)];
  selectedCharacter = result;

  // レアリティ表示
  const stars = '⭐'.repeat(result.rarity);
  const rarityLabel = result.rarity === 3 ? 'SSR!!'
                    : result.rarity === 2 ? 'SR!'
                    : 'R';
  const rarityClass = result.rarity === 3 ? 'rarity-label-ssr'
                     : result.rarity === 2 ? 'rarity-label-sr'
                     : 'rarity-label-r';

  // 結果描画
  document.getElementById('gachaResult').innerHTML = `
    <div class="gacha-box">
      <div class="gacha-header ${rarityClass}">
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

/**
 * 獲得キャラを localStorage に保存（重複なし）
 */
function addToOwnedCharacters(character) {
  const owned = JSON.parse(localStorage.getItem('ownedCharacters')) || [];
  if (!owned.find(c => c.id === character.id)) {
    owned.push(character);
    localStorage.setItem('ownedCharacters', JSON.stringify(owned));
  }
}

/**
 * 選択保存（通知設定キャラ）
 */
function saveCharacter() {
  if (!selectedCharacter) {
    alert('まずガチャを引いてください');
    return;
  }

  // localStorage に保存
  localStorage.setItem('selectedCharacterName', selectedCharacter.name);

  // サーバーに通知キャラを登録
  fetch('/api/character-select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: userId,
      name: selectedCharacter.name
    })
  })
    .then(res => res.json())
    .then(json => {
      if (json.error) {
        throw new Error(json.error);
      }
      alert(`${selectedCharacter.name} をサーバーに設定しました`);
      // 獲得キャラ一覧ページへ遷移
      window.location.href = `characters.html?userId=${encodeURIComponent(userId)}`;
    })
    .catch(err => {
      console.error('[Character Select Failed]', err);
      alert('設定に失敗しました。再度お試しください。');
    });
}

// ページ読み込み後の初期化
document.addEventListener('DOMContentLoaded', () => {
  // 獲得済みキャラ一覧リンクに userId を付与
  const link = document.getElementById('linkToCharacters');
  link.href = `characters.html?userId=${encodeURIComponent(userId)}`;

  // 過去に保存された選択キャラを表示
  const saved = localStorage.getItem('selectedCharacterName');
  if (saved) {
    document.getElementById('selectedText').textContent = `${saved} を以前に選択済み`;
  }
});

