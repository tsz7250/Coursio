/**
 * schedule-helpers.js — 課表相關函式
 * M-03: 由 window.* 全域掛載改為具名模組匯出，消除全域污染。
 */
import { Store } from '../store.js';

/**
 * 重新載入課表（透過 Puppeteer IPC）
 */
export async function refreshSchedule() {
  if (Store.isRefreshingSchedule) {
    console.warn('⚠️ 課表正在重新載入中，請勿重複點擊');
    return;
  }

  Store.isRefreshingSchedule = true;
  Store.scheduleViewState = 'loading';

  const refreshBtn = document.getElementById('refresh-schedule');
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    Store.courseScheduleData = null;

    const scheduleResult = await window.electronAPI.puppeteer.getSchedule();
    if (!scheduleResult || !scheduleResult.success) {
      throw new Error(scheduleResult?.message || '課表載入失敗，請確認已登入');
    }
    Store.courseScheduleData = scheduleResult.data;

    generateScheduleTable();
  } catch (error) {
    console.error('重新載入課表失敗:', error);
    Store.scheduleViewState = 'error';
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
    Store.isRefreshingSchedule = false;
  }
}

/**
 * 更新標題與維持向後相容的狀態切換 (原 generateScheduleTable 簡化版)
 */
export function generateScheduleTable() {
  const scheduleTitle = document.querySelector('.page-header h2');
  const scheduleSubTitle = document.querySelector('.page-header p');

  if (scheduleSubTitle) {
    scheduleSubTitle.classList.remove('alert', 'alert-light', 'py-2', 'px-3', 'mb-3');
  }

  const data = Store.courseScheduleData;
  if (data) {
    if (data.is_personal) {
      if (scheduleTitle) scheduleTitle.textContent = '📋 我的課表';
      if (scheduleSubTitle) {
        if (data.label1) {
          scheduleSubTitle.textContent = `課表資訊：${data.label1}`;
          scheduleSubTitle.classList.add('alert', 'alert-light', 'py-2', 'px-3', 'mb-3');
        } else {
          scheduleSubTitle.textContent = '';
        }
      }
    } else {
      if (scheduleTitle) scheduleTitle.textContent = '❌ 課表載入失敗';
      if (scheduleSubTitle) scheduleSubTitle.textContent = '';
    }
  } else {
    if (scheduleTitle) scheduleTitle.textContent = '📅 我的課表';
    if (scheduleSubTitle) scheduleSubTitle.textContent = '';
  }

  // 實際渲染已轉交由 Vue 元件 <ScheduleTable /> 處理
  Store.scheduleViewState = 'content';
  console.log('課表資料已就緒，由 Vue 元件接管渲染');
}

