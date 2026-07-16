import json
import sys

log_file = r"C:\Users\João Carinhanha\.gemini\antigravity-ide\brain\9368b733-3537-477a-b913-09d016f9f53b\.system_generated\logs\transcript.jsonl"
target_file = r"C:\Users\João Carinhanha\Documents\sistema-gelo-do-sertao\components\WholesalePOS.tsx"

try:
    best_content = None
    with open(log_file, "r", encoding="utf-8") as f:
        for line in f:
            try:
                data = json.loads(line)
                if data.get("type") == "VIEW_FILE" or "WholesalePOS.tsx" in line:
                    pass # But wait, view_file doesn't show the WHOLE file.
                
                # We need to find the user's last save or any tool that captured the entire file.
                # Actually, no tool captured the *entire* file because it's 1845 lines long!
            except:
                pass
except Exception as e:
    print(e)
