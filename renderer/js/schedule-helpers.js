/**
 * schedule-helpers.js — 課表相關全域函式
 * 從 app_vue.js 提取，保持向後相容（掛載在 window 上）
 */
import { Store } from './store.esm.js';

/**
 * 重新載入課表（透過 Puppeteer IPC）
 */
window.refreshSchedule = async function () {
  if (window.isRefreshingSchedule) {
    console.warn('⚠️ 課表正在重新載入中，請勿重複點擊');
    return;
  }

  window.isRefreshingSchedule = true;
  Store.scheduleViewState = 'loading';

  const refreshBtn = document.getElementById('refresh-schedule');
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    window.courseScheduleData = null;

    const scheduleResult = await window.electronAPI.puppeteer.getSchedule();
    if (!scheduleResult || !scheduleResult.success) {
      throw new Error(scheduleResult?.message || '課表載入失敗，請確認已登入');
    }
    window.courseScheduleData = scheduleResult.data;

    window.generateScheduleTable();
  } catch (error) {
    console.error('重新載入課表失敗:', error);
    Store.scheduleViewState = 'error';
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
    window.isRefreshingSchedule = false;
  }
};

/**
 * 依據 window.courseScheduleData 產生課表 DOM
 */
window.generateScheduleTable = function () {
  const scheduleTitle = document.querySelector('.page-header h2');
  const scheduleSubTitle = document.querySelector('.page-header p');

  if (scheduleSubTitle) {
    scheduleSubTitle.classList.remove('alert', 'alert-light', 'py-2', 'px-3', 'mb-3');
  }

  if (window.courseScheduleData) {
    const data = window.courseScheduleData;
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

  const timeSlots = [
    '08:10-09:00', '09:10-10:00', '10:10-11:00', '11:10-12:00',
    '12:10-13:00', '13:10-14:00', '14:10-15:00', '15:10-16:00',
    '16:10-17:00', '17:10-18:00', '18:30-19:20', '19:25-20:15',
    '20:20-21:10',
  ];

  const scheduleGrid = Array(13).fill(null).map(() => Array(7).fill(null));

  if (window.courseScheduleData && window.courseScheduleData.is_personal) {
    const courses = window.courseScheduleData.course_list || [];
    courses.forEach((course) => {
      if (course.day && course.period) {
        const day = course.day;
        const period = course.period;
        if (period >= 1 && period <= 13 && day >= 1 && day <= 7) {
          scheduleGrid[period - 1][day - 1] = {
            code: (`${course.cos_id || course.course_id || ''}`).trim().replace(/\s*\(\s*\d+\s*\)\s*$/, ''),
            name: course.name,
            teacher: course.teacher_name || '未知教師',
            room: course.room || '未知教室',
          };
        }
      } else if (course.time && course.time !== '無課程資料' && course.time !== '時間待確認') {
        if (course.time.includes('第') && course.time.includes('節')) {
          const periodMatch = course.time.match(/第\s*(\d+)\s*節/);
          if (periodMatch) {
            const period = parseInt(periodMatch[1]);
            if (period >= 1 && period <= 13) {
              scheduleGrid[period - 1][0] = {
                code: (`${course.cos_id || course.course_id || ''}`).trim().replace(/\s*\(\s*\d+\s*\)\s*$/, ''),
                name: course.name,
                teacher: course.teacher_name || '未知教師',
                room: course.room || '未知教室',
              };
            }
          }
        } else {
          const timeInfo = course.time.split(',');
          timeInfo.forEach((timeSlot) => {
            if (timeSlot && timeSlot.length >= 3) {
              try {
                const day = parseInt(timeSlot.charAt(0));
                const periods = timeSlot.substring(1);
                for (let i = 0; i < periods.length; i++) {
                  const period = parseInt(periods.charAt(i));
                  if (period >= 1 && period <= 13 && day >= 1 && day <= 7) {
                    scheduleGrid[period - 1][day - 1] = {
                      code: (`${course.cos_id || course.course_id || ''}`).trim().replace(/\s*\(\s*\d+\s*\)\s*$/, ''),
                      name: course.name,
                      teacher: course.teacher_name || '未知教師',
                      room: course.room || '未知教室',
                    };
                  }
                }
              } catch (error) {
                console.warn(`無法解析時間資訊: ${timeSlot}`, error);
              }
            }
          });
        }
      }
    });
  }

  const existingTbody = document.getElementById('schedule-tbody');
  if (!existingTbody) {
    console.error('找不到 #schedule-tbody 元素');
    return;
  }

  existingTbody.innerHTML = '';

  timeSlots.forEach((time, timeIndex) => {
    const row = document.createElement('tr');

    const timeCell = document.createElement('td');
    timeCell.className = 'schedule-time-cell';
    timeCell.textContent = `第${timeIndex + 1}節\n${time}`;
    row.appendChild(timeCell);

    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const courseData = scheduleGrid[timeIndex][dayIndex];
      const cell = document.createElement('td');
      cell.className = 'schedule-cell schedule-course-cell';

      if (courseData) {
        cell.classList.add('has-course');
        // 教室只取第一段（去掉 * 或換行後的附加資訊）
        const roomDisplay = (courseData.room || '').split('*')[0].split('\n')[0].trim();
        cell.innerHTML =
          `<span class="sched-cn">${courseData.name || ''}</span>` +
          `<span class="sched-cc">${courseData.code || ''}</span>` +
          `<span class="sched-cr">${roomDisplay}</span>`;
      } else {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'schedule-course-slot';
        emptyDiv.textContent = '-';
        cell.appendChild(emptyDiv);
      }

      row.appendChild(cell);
    }

    existingTbody.appendChild(row);
  });

  Store.scheduleViewState = 'content';
  console.log('課表已生成並顯示');
};
