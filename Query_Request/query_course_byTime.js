import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";
import fs from "node:fs/promises";

const BASE = "https://portalfun.yzu.edu.tw";

// ---- 可調的查詢條件 ----
const QUERY_CONFIG = {
  DDL_YM: "114,1  ", // 注意尾端兩個空白
  DDL_Dept: "300",   // 系所
  DDL_Degree: "1",   // 學制
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
      "Accept-Language": "zh-TW,zh-HK;q=0.8,zh;q=0.6,en-US;q=0.4,en;q=0.2",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      "Upgrade-Insecure-Requests": "1",
      DNT: "1",
      "Sec-GPC": "1",
      Connection: "keep-alive",
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

// 解析隱藏欄位和表單 action
function parseHiddenFields(html) {
  const $ = cheerio.load(html);
  const form = $("#form1");
  
  if (form.length === 0) {
    throw new Error("找不到 form1");
  }
  
  const data = {};
  
  // 收集所有隱藏欄位
  form.find("input[type='hidden']").each((_, element) => {
    const name = $(element).attr("name");
    if (name) {
      data[name] = $(element).attr("value") || "";
    }
  });
  
  // 收集所有 select 目前選取的值
  form.find("select").each((_, element) => {
    const name = $(element).attr("name");
    if (name) {
      const selected = $(element).find("option[selected]").first();
      if (selected.length > 0) {
        data[name] = selected.attr("value") || "";
      }
    }
  });
  
  const action = form.attr("action") || "./index.aspx?D=G";
  return { data, action };
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

// 解析 URL 並建立完整 URL
function buildFullUrl(baseUrl, action) {
  if (action.startsWith("http")) {
    return action;
  }
  if (action.startsWith("./")) {
    return new URL(action, baseUrl).href;
  }
  return new URL(action, baseUrl).href;
}

async function main() {
  try {
    // Step 1: GET 首頁（D=G）
    const step1Url = `${BASE}/cosSelect/index.aspx?D=G`;
    const r1 = await client.get(step1Url);
    r1.data; // 確保請求完成
    
    // 確保有 CheckCode cookie
    ensureCheckCodeCookie();
    
    const { data: hidden1, action: action1 } = parseHiddenFields(r1.data);
    const urlStep2 = buildFullUrl(r1.config.url, action1);
    
    // 防呆：檢查必要的隱藏欄位
    const requiredFields = ["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"];
    const missingFields = requiredFields.filter(field => !hidden1[field]);
    if (missingFields.length > 0) {
      throw new Error(`抓不到隱藏欄位: ${missingFields.join(", ")}`);
    }

    // Step 2: POST 切換 RadioButton4
    const step2Form = buildForm(hidden1, {
      __EVENTTARGET: "RadioButton4",
      __EVENTARGUMENT: "",
      __LASTFOCUS: "",
      Q: "RadioButton4",
      DDL_YM: QUERY_CONFIG.DDL_YM,
      DDL_Dept: QUERY_CONFIG.DDL_Dept,
      DDL_Degree: QUERY_CONFIG.DDL_Degree,
    });

    const r2 = await client.post(urlStep2, step2Form, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: BASE,
        Referer: r1.config.url,
      },
      maxRedirects: 0, // 不自動跟隨重導向
      validateStatus: (status) => status < 400, // 允許 3xx 狀態碼
    });

    assertNotRedirectLoop(r2);

    // 如果收到重導向，手動跟隨
    let response2 = r2;
    if (r2.status >= 300 && r2.status < 400 && r2.headers.location) {
      response2 = await client.get(r2.headers.location);
    }

    response2.data; // 確保請求完成
    const { data: hidden2, action: action2 } = parseHiddenFields(response2.data);
    const urlStep3 = buildFullUrl(response2.config.url, action2);

    // Step 3: POST 送出實查（Q=111）
    const ctl216  = "302";
    const step3Form = buildForm(hidden2, {
      __EVENTTARGET: "",
      __EVENTARGUMENT: "",
      __LASTFOCUS: "",
      Q: "RadioButton4",
      DDL_YM4: QUERY_CONFIG.DDL_YM,
      ctl216: ctl216,
    });

    // 確保 URL 包含 Q=111 參數
    const finalUrl = urlStep3.includes("Q=") ? urlStep3 : `${BASE}/cosSelect/index.aspx?Q=${ctl216}`;

    const r3 = await client.post(finalUrl, step3Form, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: BASE,
        Referer: `${BASE}/cosSelect/index.aspx?D=G`,
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

    // 擷取 #Table1 並輸出
    const $ = cheerio.load(html);
    const table1 = $("#Table1");

    if (table1.length) {
      const fullTableHtml = $.html(table1); // 含 <table> 標籤
      await fs.writeFile("byTime.html", fullTableHtml, "utf8");
      console.log("✅ Table1 內容已存成 byTime.html");
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
