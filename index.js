import os
import datetime
from supabase import create_client, Client
from linebot import LineBotApi
from linebot.models import TextSendMessage

# SupabaseとLINEの設定
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
LINE_CHANNEL_ACCESS_TOKEN = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
line_bot_api = LineBotApi(LINE_CHANNEL_ACCESS_TOKEN)

def notify_today_tasks():
    try:
        today = datetime.date.today().isoformat()

        # 通知設定がONのuser_idリストを取得
        settings_res = supabase.table("user_settings").select("*").eq("notify", True).execute()
        notify_user_ids = [s["user_id"] for s in settings_res.data]

        # LINEユーザーのID取得（必要であればline_userテーブル使用）
        line_user_res = supabase.table("line_users").select("user_id, line_id").execute()
        line_id_map = {user["user_id"]: user["line_id"] for user in line_user_res.data}

        # 今日のタスクを取得
        todos_res = supabase.table("todos").select("*").eq("date", today).execute()
        todos = todos_res.data

        # 通知対象のタスクをユーザーごとに整理
        user_tasks = {}
        for task in todos:
            uid = task["user_id"]
            if uid in notify_user_ids:
                user_tasks.setdefault(uid, []).append(f'・{task["task"]}（{task["time"]}）')

        # LINE通知送信
        for uid, tasks in user_tasks.items():
            if uid not in line_id_map:
                continue
            message = f"本日のタスク:\n" + "\n".join(tasks)
            try:
                line_bot_api.push_message(line_id_map[uid], TextSendMessage(text=message))
                print(f"[送信成功] {uid}: {message}")
            except Exception as e:
                print(f"[送信失敗] {uid}: {str(e)}")

    except Exception as e:
        print(f"通知処理でエラーが発生しました: {str(e)}")

if __name__ == "__main__":
    notify_today_tasks()
