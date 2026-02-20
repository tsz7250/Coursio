import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";
import fs from "node:fs/promises";

const BASE = "https://portalfun.yzu.edu.tw/cosSelect/Index.aspx?D=G";

// ---- 可調的查詢條件 ----
const QUERY_CONFIG = {
  DDL_YM: "114,1  ", // 注意尾端兩個空白
  Txt_teacher_Name: "陳鼎翰", // 教師姓名
};

// ---- 共用的 HTTP client（自動帶 Cookie）----
const jar = new CookieJar();
const client = wrapper(
  axios.create({
    jar,
    withCredentials: true,
    timeout: 30000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    // 驗證嚴格的憑證；若有公司代理攔截導致失敗，再視情況放寬（不建議）
    httpsAgent: undefined,
  })
);

// 生成隨機 CheckCode
function generateCheckCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 確保有 CheckCode cookie
function ensureCheckCodeCookie() {
  const cookies = jar.getCookiesSync(BASE);
  const hasCheckCode = cookies.some(cookie => cookie.key === "CheckCode");
  
  if (!hasCheckCode) {
    const checkCode = generateCheckCode();
    jar.setCookieSync(`CheckCode=${checkCode}; Domain=portalfun.yzu.edu.tw; Path=/`, BASE);
  }
}

// 解析隱藏欄位
function parseHiddenFields(html) {
  const $ = cheerio.load(html);
  
  const pick = (name) => {
    const element = $(`input[name="${name}"]`);
    return element.val() || "";
  };

  return {
    __EVENTTARGET: "",
    __EVENTARGUMENT: "",
    __LASTFOCUS: "",
    __VIEWSTATE: pick("__VIEWSTATE"),
    __VIEWSTATEGENERATOR: pick("__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: pick("__EVENTVALIDATION"),
  };
}

// 檢查是否為重導向迴圈
function assertNotRedirectLoop(response) {
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.location || "";
    if (location.includes("cosSelect/Index.aspx?D=G") || location.includes("cosSelect/index.aspx?D=G")) {
      throw new Error("伺服器重導回查詢首頁，通常是缺少 CheckCode 或隱藏欄位不正確造成。");
    }
  }
}

// 建立表單資料
function buildForm(hiddenFields, additionalFields = {}) {
  const form = new URLSearchParams();
  
  // 隱藏欄位
  for (const [key, value] of Object.entries(hiddenFields)) {
    form.set(key, value);
  }
  
  // 額外欄位
  for (const [key, value] of Object.entries(additionalFields)) {
    form.set(key, value);
  }
  
  return form;
}

async function main() {
  try {
    // 1) 先 GET 取得 cookies + 隱藏欄位
    const r1 = await client.get(BASE);
    r1.data; // 確保請求完成
    
    // 確保有 CheckCode cookie
    ensureCheckCodeCookie();
    
    let hidden = parseHiddenFields(r1.data);

    // 防呆：三個 hidden 缺一不可
    const requiredFields = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"];
    const missingFields = requiredFields.filter(field => !hidden[field]);
    if (missingFields.length > 0) {
      throw new Error(`抓不到隱藏欄位: ${missingFields.join(", ")}`);
    }

    // 2) 第一段 POST：切換查詢模式到「以教師姓名查詢」
    const step1Form = buildForm(hidden, {
      Q: "RadioButton3",    // 切換到教師姓名查詢模式
      DDL_YM: QUERY_CONFIG.DDL_YM,
    });

    const r2 = await client.post(BASE, step1Form, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://portalfun.yzu.edu.tw",
        Referer: BASE,
      },
      maxRedirects: 0, // 不自動跟隨重導向
      validateStatus: (status) => status < 400, // 允許 3xx 狀態碼
    });

    assertNotRedirectLoop(r2);

    // 如果收到重導向，手動跟隨
    let response = r2;
    if (r2.status >= 300 && r2.status < 400 && r2.headers.location) {
      response = await client.get(r2.headers.location);
    }

    response.data; // 確保請求完成
    hidden = parseHiddenFields(response.data); // 切換模式後 hidden 會更新

    // 3) 第二段 POST：送出查詢（按下「確定」）
    const step2Form = buildForm(hidden, {
      Q: "RadioButton3",
      DDL_YM3: QUERY_CONFIG.DDL_YM,  // 教師查詢使用 DDL_YM3
      Txt_teacher_Name: QUERY_CONFIG.Txt_teacher_Name,
      Button3: "確定",
    });

    const r3 = await client.post(BASE, step2Form, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://portalfun.yzu.edu.tw",
        Referer: BASE,
      },
      maxRedirects: 0, // 不自動跟隨重導向
      validateStatus: (status) => status < 400, // 允許 3xx 狀態碼
    });

    assertNotRedirectLoop(r3);

    // 如果收到重導向，手動跟隨
    let finalResponse = r3;
    if (r3.status >= 300 && r3.status < 400 && r3.headers.location) {
      finalResponse = await client.get(r3.headers.location);
    }

    const html = finalResponse.data;

    // 4) 擷取 #Table1 並輸出
    const $ = cheerio.load(html);
    const table1 = $("#Table1");

    if (table1.length) {
      const fullTableHtml = $.html(table1); // 含 <table> 標籤
      await fs.writeFile("byTeacher.html", fullTableHtml, "utf8");
      console.log("✅ Table1 內容已存成 byTeacher.html");
      console.log("結果頁長度：", html.length);
      console.log("頁面是否出現教師名：", html.includes(QUERY_CONFIG.Txt_teacher_Name));
    } else {
      console.log("⚠️ 未找到 Table1（可能查無資料或頁面結構變更）");
    }

  } catch (err) {
    console.error("❌ 發生錯誤:", err?.message || err);
    if (err.response) {
      console.error("📊 回應狀態:", err.response.status);
      console.error("📊 回應標頭:", err.response.headers);
    }
  }
}

main();
