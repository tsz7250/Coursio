'''
    Date  : 2019/09
    Author: Doem
    E-mail: aa0917954358@gmail.com
'''

import os
import sys
import cv2
import time
import requests
import numpy as np
from bs4 import BeautifulSoup

# 設定輸出編碼為 UTF-8
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# 設定 TensorFlow 環境變數來抑制警告
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # 只顯示錯誤訊息
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'  # 關閉 oneDNN 優化警告

from keras.models import load_model
import tensorflow as tf

# 設定 TensorFlow 日誌級別
tf.get_logger().setLevel('ERROR')

class CourseBot:
    def __init__(self, account, password):
        self.account = account
        self.password = password
        self.coursesDB = {}

        # for keras - 直接載入模型但不編譯
        model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'model.h5')
        try:
            self.model = load_model(model_path)
        except ValueError as e:
            if 'lr' in str(e):
                # 直接載入模型但跳過編譯
                self.model = load_model(model_path, compile=False)
                # 手動重新編譯
                self.model.compile(
                    optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
                    loss='categorical_crossentropy',
                    metrics=['accuracy']
                )
            else:
                raise e
        
        self.n_classes = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

        # for requests
        self.session = requests.Session()
        self.session.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36'

        self.loginUrl = 'https://isdna1.yzu.edu.tw/CnStdSel/Index.aspx'
        self.captchaUrl = 'https://isdna1.yzu.edu.tw/CnStdSel/SelRandomImage.aspx'
        self.courseListUrl = 'https://isdna1.yzu.edu.tw/CnStdSel/SelCurr/CosList.aspx'
        self.courseSelectUrl = 'https://isdna1.yzu.edu.tw/CnStdSel/SelCurr/CurrMainTrans.aspx?mSelType=SelCos&mUrl='

        self.loginPayLoad = {
            '__VIEWSTATE': '',
            '__VIEWSTATEGENERATOR': '',
            '__EVENTVALIDATION': '',
            'DPL_SelCosType': '',
            'Txt_User': self.account,
            'Txt_Password': self.password,
            'Txt_CheckCode': '',
            'btnOK': '確定'
        }

        self.selectPayLoad = {}

    def predict(self, img):
        prediction = self.model.predict(np.array([img]))

        predicStr = ""
        for pred in prediction:
            predicStr += self.n_classes[np.argmax(pred[0])]
        return predicStr

    def captchaOCR(self):
        # 檢查檔案是否存在
        if not os.path.exists('captcha.png'):
            self.log("錯誤：captcha.png 檔案不存在")
            return "ERROR"
        
        captchaImg = cv2.imread('captcha.png')
        if captchaImg is None:
            self.log("錯誤：無法讀取 captcha.png 檔案")
            return "ERROR"
        
        captchaImg = captchaImg / 255.0
        
        result = self.predict(captchaImg)
        return result

    def _safe_select_val(self, parser, selector, attr='value'):
        """安全取得 BeautifulSoup 選擇器結果值，找不到時拋出清晰錯誤"""
        els = parser.select(selector)
        if not els:
            raise ValueError('找不到頁面元素: {}'.format(selector))
        return els[0].get(attr, '')

    # login into system and get session
    def login(self):
        max_login_attempts = int(os.environ.get('MAX_LOGIN_ATTEMPTS', '10'))
        for attempt in range(1, max_login_attempts + 1):
            # clear Session object
            self.session.cookies.clear()

            try:
                # download and recognize captcha
                with self.session.get(self.captchaUrl, stream=True, timeout=(10, 30)) as captchaHtml:
                    with open('captcha.png', 'wb') as img:
                        img.write(captchaHtml.content)

                captcha = self.captchaOCR()

                # get login data
                loginHtml = self.session.get(self.loginUrl, timeout=(10, 30))

                # check if system is open
                if '選課系統尚未開放!' in loginHtml.text:
                    self.log('選課系統尚未開放!')
                    continue

                # use BeautifulSoup to parse html
                parser = BeautifulSoup(loginHtml.text, 'lxml')

                # update login payload
                self.loginPayLoad['__VIEWSTATE'] = self._safe_select_val(parser, "#__VIEWSTATE")
                self.loginPayLoad['__VIEWSTATEGENERATOR'] = self._safe_select_val(parser, "#__VIEWSTATEGENERATOR")
                self.loginPayLoad['__EVENTVALIDATION'] = self._safe_select_val(parser, "#__EVENTVALIDATION")
                opts = parser.select("#DPL_SelCosType option")
                if len(opts) < 2:
                    self.log('無法取得選課類型選項，重試...')
                    continue
                self.loginPayLoad['DPL_SelCosType'] = opts[1]['value']
                self.loginPayLoad['Txt_CheckCode'] = captcha

                result = self.session.post(self.loginUrl, data=self.loginPayLoad, timeout=(10, 30))
                if "parent.location ='SelCurr.aspx?Culture=zh-tw'" in result.text:
                    self.log('Login Successful! {}'.format(captcha))
                    return
                elif "資料庫發生異常" in result.text:
                    self.log('帳號或密碼錯誤，請重新確認。')
                    sys.exit(1)
                elif "您未在此階段選課時程之內!請於時程內選課!!" in result.text:
                    self.log('您未在此階段選課時程之內!請於時程內選課!!')
                    sys.exit(1)
                else:
                    self.log('Login Failed, Re-try! ({}/{})'.format(attempt, max_login_attempts))

            except Exception as e:
                self.log('登入過程發生錯誤 ({}/{}): {}'.format(attempt, max_login_attempts, str(e)))

        raise RuntimeError('達到最大登入嘗試次數 ({})，請確認帳密及網路連線後重試'.format(max_login_attempts))

    def getCourseDB(self, depts):

        for dept in depts:
            try:
                # use BeautifulSoup to parse html
                html = self.session.get(self.courseListUrl, timeout=(10, 30))
                if "異常登入" in html.text:
                    self.log("異常登入，休息10分鐘!")
                    time.sleep(600) # sleep 10 min
                    continue
                parser = BeautifulSoup(html.text, 'lxml')

                self.selectPayLoad[dept] = {
                    '__EVENTTARGET': 'DPL_Degree',
                    '__EVENTARGUMENT': '',
                    '__LASTFOCUS': '',
                    '__VIEWSTATE': self._safe_select_val(parser, "#__VIEWSTATE"),
                    '__VIEWSTATEGENERATOR': self._safe_select_val(parser, "#__VIEWSTATEGENERATOR"),
                    '__VIEWSTATEENCRYPTED': '',
                    '__EVENTVALIDATION': self._safe_select_val(parser, "#__EVENTVALIDATION"),
                    'Hidden1': '',
                    'Hid_SchTime': '',
                    'DPL_DeptName': dept,
                    'DPL_Degree': '6',
                }

                # use BeautifulSoup to parse html
                html = self.session.post(self.courseListUrl, data=self.selectPayLoad[dept], timeout=(10, 30))
                if "Error" in html.text:
                    self.log('Wrong coursesList, please check it again!')
                    sys.exit(1)
                parser = BeautifulSoup(html.text, 'lxml')

                # parse and save courses information
                courseList = parser.select("#CosListTable input")
                for courseInfo in courseList:
                    tokens = courseInfo.attrs['name'].split(',') # SelCos,CS354,A,1,F,3,Y,Chinese,CS354,A,3 電腦與網路安全概論

                    key = tokens[1] + tokens[2]
                    courseName = '{} {}'.format(key, tokens[-1].split(' ')[1])

                    self.coursesDB[key] = {
                        'name': courseName,
                        'mUrl': courseInfo.attrs['name']
                    }

                self.log('Get {} Data Completed!'.format(dept))
            except Exception as e:
                self.log('載入部門 {} 課程資料失敗: {}'.format(dept, str(e)))



    def selectCourses(self, coursesList, delay = 2.5):
        # 從環境變數讀取最大循環次數（0 或未設定視為無上限）
        try:
            max_attempts_env = int(os.environ.get('MAX_ATTEMPTS', '0'))
        except Exception:
            max_attempts_env = 0

        attemptCount = 0
        while len(coursesList) > 0:
            for course in coursesList.copy():
                tokens = course.split(',')
                dept = tokens[0]
                key  = tokens[1]

                # check if the classID is legal
                if key not in self.coursesDB:
                    self.log('{} is not a legal classID'.format(key))
                    coursesList.remove(course)
                    continue

                # check if dept payload is available
                if dept not in self.selectPayLoad:
                    self.log('{} 部門資料未載入，跳過課程 {}'.format(dept, key))
                    coursesList.remove(course)
                    continue

                try:
                    # simulate click button
                    html = self.session.post(self.courseListUrl, data=self.selectPayLoad[dept], timeout=(10, 30))
                    parser = BeautifulSoup(html.text, 'lxml')

                    selectPayLoad = {
                        '__EVENTTARGET': '',
                        '__EVENTARGUMENT': '',
                        '__LASTFOCUS': '',
                        '__VIEWSTATE': self._safe_select_val(parser, "#__VIEWSTATE"),
                        '__VIEWSTATEGENERATOR': self._safe_select_val(parser, "#__VIEWSTATEGENERATOR"),
                        '__VIEWSTATEENCRYPTED': '',
                        '__EVENTVALIDATION': self._safe_select_val(parser, "#__EVENTVALIDATION"),
                        'Hidden1': '',
                        'Hid_SchTime': '',
                        'DPL_DeptName': dept,
                        'DPL_Degree': '6',
                        self.coursesDB[key]['mUrl'] + '.x': '0',
                        self.coursesDB[key]['mUrl'] + '.y': '0'
                    }
                    self.session.post(self.courseListUrl, data=selectPayLoad, timeout=(10, 30))

                    # select course
                    html = self.session.get(self.courseSelectUrl + self.coursesDB[key]['mUrl'] + ' ,B,', timeout=(10, 30))

                    # check if successful
                    parser = BeautifulSoup(html.text, 'lxml')
                    script_els = parser.select("script")
                    if not script_els or not script_els[0].string:
                        self.log('{} 無法解析選課回應，稍後重試'.format(key))
                        time.sleep(delay)
                        continue
                    alertMsg = script_els[0].string.split(';')[0]
                    self.log('{} {}'.format(self.coursesDB[key]['name'], alertMsg[7:-2]))

                    if "加選訊息：" in alertMsg or "已選過" in alertMsg:
                        coursesList.remove(course)
                    elif "please log on again!" in alertMsg:
                        self.login()

                except Exception as e:
                    self.log('選課 {} 發生錯誤，稍後重試: {}'.format(key, str(e)))

                time.sleep(delay)
            attemptCount += 1
            if max_attempts_env > 0 and attemptCount >= max_attempts_env:
                break

    def log(self, msg):
        print(time.strftime("[%Y-%m-%d %H:%M:%S]", time.localtime()), msg)

if __name__ == '__main__':
    # 從環境變數取得帳密（由 Electron 主程序注入，不再使用 accounts.ini）
    Account = os.environ.get('PORTAL_ACCOUNT', '').strip()
    Password = os.environ.get('PORTAL_PASSWORD', '').strip()
    if not Account or not Password:
        print('錯誤：未設定 PORTAL_ACCOUNT / PORTAL_PASSWORD 環境變數。請在應用程式帳號設定頁面填入帳號密碼後再啟動機器人。')
        sys.exit(1)

    # 從 courses.json 讀取課程清單（由 Electron 主程序寫出）
    import json as _json
    _courses_json = os.environ.get('COURSES_JSON_PATH') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'courses.json')
    if not os.path.exists(_courses_json):
        print('找不到 courses.json，請先將課程加入選課清單')
        exit(1)
    with open(_courses_json, 'r', encoding='utf-8') as _f:
        coursesList = _json.load(_f)

    # Time Parameter, sleep n seconds
    try:
        delay = float(os.environ.get('DELAY_INTERVAL', '2.5'))
    except Exception:
        delay = 2.5
    
    depts = set([i.split(',')[0] for i in coursesList])
    
    myBot = CourseBot(Account, Password)
    myBot.login()
    myBot.getCourseDB(depts)
    myBot.selectCourses(coursesList, delay)