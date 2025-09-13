#!/usr/bin/env python3
"""
測試 yzuCourseBot 環境
檢查所有必要的 Python 套件是否正確安裝
"""

import sys
import os

def test_python_version():
    """測試 Python 版本"""
    print(f"Python 版本: {sys.version}")
    if sys.version_info < (3, 8):
        print("❌ Python 版本過舊，建議使用 3.8+")
        return False
    print("✅ Python 版本符合要求")
    return True

def test_packages():
    """測試必要套件"""
    packages = [
        ('numpy', 'NumPy 數值運算'),
        ('cv2', 'OpenCV 圖像處理'),
        ('requests', 'HTTP 請求'),
        ('bs4', 'BeautifulSoup HTML 解析'),
        ('tensorflow', 'TensorFlow 機器學習'),
        ('configparser', 'ConfigParser 設定檔解析'),
        ('h5py', 'HDF5 檔案處理')
    ]
    
    success = True
    
    for package, description in packages:
        try:
            if package == 'cv2':
                import cv2
                print(f"✅ {description}: {cv2.__version__}")
            elif package == 'bs4':
                import bs4
                print(f"✅ {description}: {bs4.__version__}")
            elif package == 'tensorflow':
                import tensorflow as tf
                print(f"✅ {description}: {tf.__version__}")
            else:
                module = __import__(package)
                version = getattr(module, '__version__', '未知版本')
                print(f"✅ {description}: {version}")
        except ImportError as e:
            print(f"❌ {description}: 未安裝 ({e})")
            success = False
        except Exception as e:
            print(f"⚠️ {description}: 載入錯誤 ({e})")
    
    return success

def test_model_file():
    """測試模型檔案"""
    model_path = 'model.h5'
    if os.path.exists(model_path):
        size = os.path.getsize(model_path)
        print(f"✅ AI 模型檔案存在: {model_path} ({size:,} bytes)")
        return True
    else:
        print(f"❌ AI 模型檔案不存在: {model_path}")
        return False

def test_tensorflow_gpu():
    """測試 TensorFlow GPU 支援"""
    try:
        import tensorflow as tf
        gpus = tf.config.list_physical_devices('GPU')
        if gpus:
            print(f"🚀 GPU 支援: 找到 {len(gpus)} 個 GPU")
            for i, gpu in enumerate(gpus):
                print(f"   GPU {i}: {gpu.name}")
        else:
            print("💻 使用 CPU 模式 (未檢測到 GPU)")
    except Exception as e:
        print(f"⚠️ GPU 檢測失敗: {e}")

def main():
    """主測試函數"""
    print("🐍 yzuCourseBot 環境測試")
    print("=" * 50)
    
    success = True
    
    # 測試 Python 版本
    success &= test_python_version()
    print()
    
    # 測試套件
    print("📦 測試 Python 套件:")
    success &= test_packages()
    print()
    
    # 測試模型檔案
    print("🤖 測試 AI 模型檔案:")
    success &= test_model_file()
    print()
    
    # 測試 GPU 支援
    print("🔧 測試 TensorFlow GPU 支援:")
    test_tensorflow_gpu()
    print()
    
    # 總結
    print("=" * 50)
    if success:
        print("🎉 環境測試通過！yzuCourseBot 可以正常使用")
        return 0
    else:
        print("❌ 環境測試失敗！請安裝缺少的套件")
        print("\n💡 安裝命令:")
        print("   pip install -r requirements.txt")
        return 1

if __name__ == '__main__':
    sys.exit(main())