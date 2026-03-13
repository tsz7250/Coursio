"""
M-09: 套件存在性檢查腳本
此腳本由 python_bot.js 的 checkPythonPackages() 呼叫執行。
"""
import sys
import importlib

pkgs = ['tensorflow', 'cv2', 'numpy', 'requests', 'bs4', 'configparser']

missing = []
for p in pkgs:
    try:
        importlib.import_module(p)
    except ImportError:
        missing.append(p)

if missing:
    print("MISSING: " + ", ".join(missing))
    sys.exit(1)
else:
    print("SUCCESS: All packages available")
