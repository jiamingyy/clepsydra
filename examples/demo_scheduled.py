"""Clepsydra 定时任务示例：每次触发执行一次并退出（适合 cron / 固定间隔模式）。"""
import datetime
import random

if __name__ == "__main__":
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[demo] 定时任务触发于 {now}")
    print(f"[demo] 本次随机数: {random.randint(0, 100)}")
    # 退出码 0 表示成功；非 0 会在任务的「上次退出」中显示为失败
