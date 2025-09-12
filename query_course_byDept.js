import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import * as cheerio from "cheerio";
import fs from "node:fs/promises";

const BASE = "https://portalfun.yzu.edu.tw/cosSelect/index.aspx?D=G";

// ---- 可調的查詢條件 ----
const QUERY_PAYLOAD = {
  Q: "RadioButton1",
  DDL_YM: "114,1  ", // 注意尾端兩個空白
  DDL_Dept: "304",
  DDL_Degree: "1",
  Button1: "確定",
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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    // 驗證嚴格的憑證；若有公司代理攔截導致失敗，再視情況放寬（不建議）
    httpsAgent: undefined,
  })
);

async function fetchHiddenFields() {
  const r = await client.get(BASE);
  const $ = cheerio.load(r.data);
  const viewstate = $("#__VIEWSTATE").val() ?? "";
  const viewstategen = $("#__VIEWSTATEGENERATOR").val() ?? "";
  const eventvalid = $("#__EVENTVALIDATION").val() ?? "";

  if (!viewstate || !eventvalid) {
    throw new Error("無法取得必要的隱藏欄位：__VIEWSTATE 或 __EVENTVALIDATION");
  }

  return { viewstate, viewstategen, eventvalid };
}

function buildForm({ viewstate, viewstategen, eventvalid }) {
  const form = new URLSearchParams();
  form.set("__EVENTTARGET", "");
  form.set("__EVENTARGUMENT", "");
  form.set("__LASTFOCUS", "");
  form.set("__VIEWSTATE", viewstate);
  form.set("__VIEWSTATEGENERATOR", viewstategen);
  form.set("__EVENTVALIDATION", eventvalid);

  // 實際查詢欄位
  for (const [k, v] of Object.entries(QUERY_PAYLOAD)) form.set(k, v);
  return form;
}


async function main() {
  try {
    // 1) 先 GET 取得 cookies + 隱藏欄位
    const hidden = await fetchHiddenFields();

    // 2) POST 查詢
    const form = buildForm(hidden);
    const r2 = await client.post(BASE, form, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: BASE,
      },
    });

    const html = r2.data;

    // 3) 擷取 #Table1 並輸出
    const $ = cheerio.load(html);
    const table1 = $("#Table1");

    if (table1.length) {
      const fullTableHtml = $.html(table1); // 含 <table> 標籤
      await fs.writeFile("table1.html", fullTableHtml, "utf8");
      console.log("✅ Table1 內容已存成 table1.html");
    } else {
      console.log("⚠️ 未找到 Table1（可能查無資料或頁面結構變更）");
    }
  } catch (err) {
    console.error("❌ 發生錯誤:", err?.message || err);
  }
}

main();
