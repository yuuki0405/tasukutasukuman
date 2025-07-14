
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".contact-form");

  form.addEventListener("submit", (e) => {
    e.preventDefault(); // フォームの送信をキャンセル
    alert("お問い合わせを送信しました。ありがとうございます！");
    form.reset(); // 入力欄をクリア
  });
});
