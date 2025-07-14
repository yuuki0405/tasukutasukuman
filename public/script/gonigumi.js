document.addEventListener('DOMContentLoaded', () => {
  const saveRulesBtn = document.getElementById('saveRulesBtn');
  const rulesForm = document.getElementById('rulesForm');
  const selectedRulesList = document.getElementById('selectedRulesList');

  const memberNameInput = document.getElementById('memberNameInput');
  const addMemberBtn = document.getElementById('addMemberBtn');
  const memberList = document.getElementById('memberList');

  // ---------- メンバー追加機能 ----------
  addMemberBtn.addEventListener('click', () => {
    const name = memberNameInput.value.trim();

    if (name === '') {
      alert('メンバー名を入力してください。');
      return;
    }

    const li = document.createElement('li');
    li.textContent = name;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '削除';
    removeBtn.style.marginLeft = '10px';
    removeBtn.addEventListener('click', () => {
      memberList.removeChild(li);
      // ローカルストレージからも削除
      removeMember(name);
    });

    li.appendChild(removeBtn);
    memberList.appendChild(li);

    saveMember(name);

    memberNameInput.value = '';
  });

  function saveMember(name) {
    let members = JSON.parse(localStorage.getItem('members') || '[]');
    members.push(name);
    localStorage.setItem('members', JSON.stringify(members));
  }

  function loadMembers() {
    let members = JSON.parse(localStorage.getItem('members') || '[]');
    members.forEach(name => {
      const li = document.createElement('li');
      li.textContent = name;

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '削除';
      removeBtn.style.marginLeft = '10px';
      removeBtn.addEventListener('click', () => {
        memberList.removeChild(li);
        removeMember(name);
      });

      li.appendChild(removeBtn);
      memberList.appendChild(li);
    });
  }

  function removeMember(name) {
    let members = JSON.parse(localStorage.getItem('members') || '[]');
    members = members.filter(member => member !== name);
    localStorage.setItem('members', JSON.stringify(members));
  }

  loadMembers();

  // ---------- ルール保存機能 ----------
  loadSavedRules();

  saveRulesBtn.addEventListener('click', () => {
    const selectedRules = getSelectedRules();
    saveRules(selectedRules);
    renderSelectedRules(selectedRules);
  });

  function getSelectedRules() {
    return Array.from(rulesForm.querySelectorAll('input[name="rule"]:checked'))
      .map(input => input.value);
  }

  function saveRules(rules) {
    try {
      localStorage.setItem('selectedRules', JSON.stringify(rules));
    } catch (e) {
      console.error('保存失敗:', e);
    }
  }

  function loadSavedRules() {
    try {
      const saved = localStorage.getItem('selectedRules');
      if (saved) {
        const rules = JSON.parse(saved);
        checkSavedRules(rules);
        renderSelectedRules(rules);
      }
    } catch (e) {
      console.error('読み込み失敗:', e);
    }
  }

  function checkSavedRules(rules) {
    rulesForm.querySelectorAll('input[name="rule"]').forEach(input => {
      input.checked = rules.includes(input.value);
    });
  }

  function renderSelectedRules(rules) {
    selectedRulesList.innerHTML = '';
    rules.forEach((rule, index) => {
      const li = document.createElement('li');
      li.textContent = rule;

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '削除';
      deleteBtn.className = 'delete-rule-btn';
      deleteBtn.style.marginLeft = '10px';
      deleteBtn.onclick = () => {
        rules.splice(index, 1);
        saveRules(rules);
        checkSavedRules(rules);
        renderSelectedRules(rules);
      };

      li.appendChild(deleteBtn);
      selectedRulesList.appendChild(li);
    });
  }
});


