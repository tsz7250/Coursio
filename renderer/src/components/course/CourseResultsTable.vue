<template>
  <div class="courses-list" v-if="courses.length > 0">
    <!-- Modal -->
    <input type="checkbox" id="MHmodal" />
    <label for="MHmodal" class="MHmodal-bg"></label>
    <div class="MHmodal-content">
      <label for="MHmodal" class="close">
        <i data-lucide="x" class="icon-20"></i>
      </label>
      <header>
        <h2>{{ modalCourse.name }}</h2>
      </header>
      <article class="content">
        <p>由{{ modalCourse.teacher_name }}教授教導，為系上的{{ modalCourse.cos_type_name }}課程之一，上課教室位於{{ modalCourse.room }}，學分數為{{ modalCourse.credit }}。</p>
      </article>
    </div>

    <div class="w-full">
      <table id="courses-list-data-table" class="query-results-table">
        <colgroup>
          <col><col><col><col><col><col><col><col><col>
        </colgroup>
        <thead>
          <tr>
            <th>課號班別</th>
            <th>開課系級</th>
            <th>課程名稱</th>
            <th>選別</th>
            <th>時間,教室</th>
            <th>授課教師</th>
            <th>選課人數 / 上限</th>
            <th>學分數</th>
            <th>加入選課名單</th>
          </tr>
        </thead>
        <tbody>
          <tr :key="'course-list'+course.hashid" v-for="course in courses"
            :data-hashid="course.hashid" class="accordion-toggle">
            <td class="code-cell">{{ course.cos_id || '' }}{{ course.cos_class || '' }}</td>
            <td class="dept-cell">{{ course.dept_grade || course.dept_name || '' }}</td>
            <td class="point-it name-cell" :title="course.name" @click="showCourseDetail($event, course)">{{ course.name }}</td>
            <td class="type-cell">{{ course.type || course.cos_type_name || '' }}</td>
            <td class="time-room-cell">{{ course.time_room || '' }}</td>
            <td class="teacher-cell u-pre-line">{{ course.teacher_name || course.teacher || '' }}</td>
            <td class="people-cell">
              <span v-if="course.reg_num !== undefined && course.reg_num !== '' && course.max_num !== undefined && course.max_num !== ''">
                {{ course.reg_num }} / {{ course.max_num }}
              </span>
              <span v-else>-</span>
            </td>
            <td class="credit-cell">
              <span v-if="course.credit_loading" class="credit-loading">載入中...</span>
              <span v-else-if="course.credit" class="credit-value">{{ course.credit }}</span>
              <span v-else class="credit-unknown">-</span>
            </td>
            <td>
              <span v-if="isLoggedIn" @click="addToSchedule($event, course)"
                class="btn btn-cyan btn-sm btn-join-interactive point-it">加入</span>
              <span v-else class="btn disabled login-disabled-btn btn-sm">需登入</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Store } from '../../store.js';
import { requestQueue } from '../../utils/requestQueue.js';

defineProps({
  courses: { type: Array, required: true },
  isLoggedIn: { type: Boolean, default: false },
  queryYear: { type: String, default: '' },
  querySmtr: { type: String, default: '' }
});

const emit = defineEmits(['show-detail']);

const modalCourse = computed({
  get: () => Store.modalCourse,
  set: (v) => { Store.modalCourse = v; }
});

// ── 課程驗證 ──
function validateCourseData(courseData) {
  const errors = [];
  if (!courseData.cos_id || courseData.cos_id.trim() === '') errors.push('課程代碼不能為空');
  if (!courseData.name || courseData.name.trim() === '') errors.push('課程名稱不能為空');
  if (courseData.credit && (isNaN(courseData.credit) || courseData.credit < 0)) errors.push('學分數必須為非負整數');
  return { isValid: errors.length === 0, errors };
}

// ── 時間與教室精確提取、序列化與比對 ──
function parseTimeRoomToPairs(timeRoom) {
  if (!timeRoom || timeRoom.trim() === '') return [];
  const lines = timeRoom.split('\n').map(l => l.trim()).filter(l => l !== '');
  const pairs = [];
  
  lines.forEach(line => {
    if (line.includes(',')) {
      const parts = line.split(',');
      const t = parts[0].trim();
      const r = parts[1] ? parts[1].trim() : '';
      if (t) pairs.push({ time: t, room: r });
    } else {
      if (line) pairs.push({ time: line, room: '' });
    }
  });
  return pairs;
}

function serializePairs(pairs) {
  return pairs.map(p => `${p.time}:${p.room}`).join(';');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatFriendlyTime(timeStr) {
  if (!timeStr || timeStr === '無課程資料' || timeStr === '時間待確認') {
    return '時間待確認';
  }
  const dayNames = {
    '1': '週一', '2': '週二', '3': '週三', '4': '週四', '5': '週五', '6': '週六', '7': '週日'
  };
  const segments = timeStr.split(/[;,]/);
  const groups = {};
  
  segments.forEach(seg => {
    const trimmed = seg.trim();
    if (!trimmed) return;
    let timeCode = trimmed;
    let room = '';
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      timeCode = parts[0].trim();
      room = parts[1] ? parts[1].trim() : '';
    }
    
    if (timeCode.length >= 3) {
      const day = timeCode.charAt(0);
      const periodStr = timeCode.substring(1);
      const period = parseInt(periodStr, 10);
      if (!isNaN(period)) {
        const key = `${day}_${room}`;
        if (!groups[key]) {
          groups[key] = {
            day: dayNames[day] || `週${day}`,
            room: room,
            periods: []
          };
        }
        groups[key].periods.push(period);
      }
    } else {
      const key = `other_${room}`;
      if (!groups[key]) {
        groups[key] = {
          day: '',
          room: room,
          periods: [timeCode]
        };
      } else {
        groups[key].periods.push(timeCode);
      }
    }
  });
  
  const result = [];
  for (const group of Object.values(groups)) {
    const sortedPeriods = group.periods.sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a).localeCompare(String(b));
    });
    
    const formattedPeriods = sortedPeriods.map(p => {
      if (typeof p === 'number') {
        return p < 10 ? `0${p}` : `${p}`;
      }
      return p;
    }).join(', ');
    
    let str = '';
    if (group.day) {
      str += `${group.day} 第 ${formattedPeriods} 節`;
    } else {
      str += formattedPeriods;
    }
    if (group.room) {
      str += ` (${group.room})`;
    }
    result.push(str);
  }
  
  return result.join('、');
}

function getConflictMessageHtml(newCourseName, conflictingCourses) {
  let listItemsHtml = '';
  conflictingCourses.forEach(c => {
    const timeFormatted = formatFriendlyTime(c.time);
    listItemsHtml += `
      <div class="conflict-item">
        <div class="conflict-item-title">【已排入】${escapeHtml(c.name)}</div>
        <div class="conflict-item-time">⏰ 時間：${escapeHtml(timeFormatted)}</div>
      </div>
    `;
  });

  return `
    <div class="conflict-container">
      <div class="conflict-warning-header">
        <span>⚠️ 時間衝突警告</span>
      </div>
      <div>
        欲加入的課程<strong>「${escapeHtml(newCourseName)}」</strong>與預排課表中的課程存在時間重疊：
      </div>
      <div class="conflict-list">
        ${listItemsHtml}
      </div>
      <div class="conflict-prompt">
        確定要移出上述衝突的課程，並將新課程加入預排課表嗎？
      </div>
    </div>
  `;
}

function getPeriodsSet(timeStr) {
  const periods = new Set();
  if (!timeStr || timeStr === '無課程資料' || timeStr === '時間待確認') {
    return periods;
  }
  
  const timeCodes = [];
  const segments = timeStr.split(/[;,]/);
  segments.forEach(seg => {
    const trimmed = seg.trim();
    if (trimmed) {
      if (trimmed.includes(':')) {
        const parts = trimmed.split(':');
        const t = parts[0] ? parts[0].trim() : '';
        if (t) timeCodes.push(t);
      } else {
        timeCodes.push(trimmed);
      }
    }
  });
  
  timeCodes.forEach(code => {
    if (code.length >= 3) {
      const day = code.charAt(0);
      const periodsStr = code.substring(1);
      const period = parseInt(periodsStr, 10);
      if (!isNaN(period) && period >= 1 && period <= 13) {
        periods.add(`${day}-${period}`);
      }
    }
  });
  return periods;
}

function hasConflict(timeStr1, timeStr2) {
  const set1 = getPeriodsSet(timeStr1);
  const set2 = getPeriodsSet(timeStr2);
  for (const p of set1) {
    if (set2.has(p)) {
      return true;
    }
  }
  return false;
}

async function addToSchedule(event, course) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (!course) {
    alert('錯誤：未傳入課程資料！');
    return;
  }
  try {
    let courseToUse = { ...course };
    if (course.isFromTimeQuery) {
      if (typeof M !== 'undefined' && M.toast) {
        M.toast({ html: '🔍 正在取得課程完整時間教室資料...', displayLength: 2000 });
      }
      try {
        const ddl_ym = `${course.year},${course.smtr}`;
        const res = await requestQueue.enqueue(
          () => window.electronAPI.backend.getFullCourseInfo(
            ddl_ym,
            course.name || course.cos_name || '',
            course.cos_id,
            course.cos_class || 'A'
          ),
          'high'
        );
        if (res && res.success && res.course) {
          courseToUse.time_room = res.course.time_room;
          if (typeof M !== 'undefined' && M.toast) {
            M.toast({ html: '✅ 成功取得完整課程時間！', displayLength: 2000 });
          }
        } else {
          console.warn('無法取得完整時間資料:', res?.message);
          if (typeof M !== 'undefined' && M.toast) {
            M.toast({ html: '⚠️ 無法取得完整課程時間，將使用目前時間加入', displayLength: 3000 });
          }
        }
      } catch (err) {
        console.error('補完完整課程時間失敗:', err);
      }
    }

    const pairs = parseTimeRoomToPairs(courseToUse.time_room);
    const parsedTime = serializePairs(pairs);
    
    const uniqueRooms = new Set();
    pairs.forEach(p => { if (p.room) uniqueRooms.add(p.room); });
    const parsedRoom = Array.from(uniqueRooms).join(', ');

    const courseData = {
      cos_id: courseToUse.cos_id || '',
      cos_class: courseToUse.cos_class || 'A',
      name: courseToUse.name || courseToUse.cos_name || '',
      teacher_name: courseToUse.teacher_name || courseToUse.teacher || '',
      credit: courseToUse.credit || courseToUse.credits || 0,
      dept_id: courseToUse.dept_id || '',
      status: 0,
      time: parsedTime,
      room: parsedRoom
    };
    const deptSelectElement = document.querySelector('#querySelectQueryDept');
    if (!courseData.dept_id && deptSelectElement && deptSelectElement.value)
      courseData.dept_id = deptSelectElement.value;

    const validation = validateCourseData(courseData);
    if (!validation.isValid) {
      if (typeof M !== 'undefined' && M.toast) M.toast({ html: '資料驗證失敗: ' + validation.errors.join(', '), displayLength: 4000 });
      return;
    }
    const existingCourse = await window.electronAPI.db.checkTaskExists(
      courseData.cos_id, courseData.cos_class
    );
    if (existingCourse) {
      if (typeof M !== 'undefined' && M.toast) M.toast({ html: `課程 ${courseData.cos_id}${courseData.cos_class} 已存在於選課清單中`, displayLength: 3000 });
      return;
    }

    // 檢查預排課表時間衝突
    const allTasks = await window.electronAPI.db.getAllTasks();
    const conflictingCourses = [];
    for (const task of allTasks) {
      if (task.time && hasConflict(parsedTime, task.time)) {
        conflictingCourses.push(task);
      }
    }

    let confirmed = false;
    try {
      const confirmFn = window.customConfirm || ((msg) => Promise.resolve(window.confirm(msg)));
      if (conflictingCourses.length > 0) {
        const msgHtml = getConflictMessageHtml(courseData.name, conflictingCourses);
        confirmed = await confirmFn(msgHtml, '時間衝突警告');
      } else {
        confirmed = await confirmFn(
          `確定要將「${courseData.name}」加入預排課表嗎？`,
          '加入課程確認'
        );
      }
    } catch (confirmError) {
      alert('確認視窗執行出錯: ' + (confirmError?.message || confirmError));
      return;
    }

    if (!confirmed) {
      return;
    }

    // 若確認覆蓋，則完全移除衝突的舊課程
    if (conflictingCourses.length > 0) {
      for (const confCourse of conflictingCourses) {
        await window.electronAPI.db.deleteTask(confCourse.id);
      }
    }

    const result = await window.electronAPI.db.addTask(courseData);
    
    // 更新全域狀態以利其他頁面即時反應
    try {
      const updatedTasks = await window.electronAPI.db.getAllTasks();
      Store.tasks = updatedTasks || [];
    } catch (dbErr) {
      console.warn('同步更新全域任務列表失敗:', dbErr);
    }

    if (result && result.id) {
      let toastMsg = `已加入 ${courseData.cos_id}${courseData.cos_class} - ${courseData.name}`;
      if (conflictingCourses.length > 0) {
        toastMsg += `（已替換 ${conflictingCourses.length} 門衝突課程）`;
      }
      if (typeof M !== 'undefined' && M.toast) {
        M.toast({ html: toastMsg, displayLength: 3000 });
      }
    } else {
      if (typeof M !== 'undefined' && M.toast) M.toast({ html: '課程已加入但無法確認，請檢查選課任務列表', displayLength: 3000 });
    }
  } catch (error) {
    console.error('加入選課清單失敗:', error);
    if (typeof M !== 'undefined' && M.toast) M.toast({ html: '加入選課清單失敗: ' + error.message, displayLength: 4000 });
  }
}

function showCourseDetail(event, course) {
  event.preventDefault();
  event.stopPropagation();
  emit('show-detail', {
    year: course.year,
    smtr: course.smtr,
    cos_id: course.cos_id,
    cos_class: course.cos_class || 'A'
  });
}
</script>

<style scoped lang="scss">
/* 課程列表表格樣式 */
.query-results-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'Open Sans', sans-serif;
  
  th {
    background: #F8FAFC;
    padding: 12px 16px;
    font-size: 11px;
    font-weight: 700;
    color: #64748B;
    text-transform: uppercase;
    text-align: left;
    border-bottom: 1px solid #E2E8F0;
    white-space: nowrap;
  }

  td {
    padding: 16px;
    font-size: 14px;
    color: #334155;
    border-bottom: 1px solid #F1F5F9;
    vertical-align: middle;
  }

  tr:hover { background: #F8FAFC; }
}

/* 欄位寬度控制 */
#courses-list-data-table {
  colgroup col:nth-child(1) { width: 100px; }
  colgroup col:nth-child(2) { width: 160px; }
  colgroup col:nth-child(3) { width: auto; }
  colgroup col:nth-child(4) { width: 70px; }
  colgroup col:nth-child(5) { width: 180px; }
  colgroup col:nth-child(6) { width: 90px; }
  colgroup col:nth-child(7) { width: 110px; }
  colgroup col:nth-child(8) { width: 60px; }
  colgroup col:nth-child(9) { width: 110px; }

  td.name-cell {
    font-weight: 600;
    color: #0891B2;
    line-height: 1.4;
  }

  td.code-cell, td.dept-cell, td.type-cell {
    font-size: 13px;
    color: #64748B;
  }

  td.time-room-cell {
    font-size: 12px;
    color: #475569;
    line-height: 1.5;
    white-space: pre-line;
  }

  td.teacher-cell { font-size: 13px; }

  td.people-cell {
    text-align: center;
    font-size: 13px;
    color: #475569;
  }

  td.credit-cell {
    text-align: center;
    font-weight: 600;
    color: #0F172A;
  }
}

@media (max-width: 1024px) {
  #courses-list-data-table {
    colgroup col:nth-child(5) { width: 180px; }
    colgroup col:nth-child(2) { width: 140px; }
  }
}

/* Modal 簡易樣式 */
.MHmodal-bg {
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: rgba(0,0,0,0.5);
  display: none;
  z-index: 1000;
}
#MHmodal:checked ~ .MHmodal-bg { display: block; }
#MHmodal:checked ~ .MHmodal-content { display: block; }

.MHmodal-content {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: #FFF;
  padding: 32px;
  border-radius: 16px;
  width: 90%;
  max-width: 500px;
  z-index: 1001;
  display: none;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);

  h2 { margin: 0 0 16px; color: #164E63; font-size: 20px; }
  .content { line-height: 1.6; color: #475569; }
  .close { position: absolute; top: 16px; right: 16px; cursor: pointer; color: #94A3B8; }
}
#MHmodal { display: none; }

/* 加入按鈕的精緻微互動效果 */
.btn-join-interactive {
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, background-color 0.2s ease;
  position: relative;
  overflow: hidden;
  
  &:hover {
    transform: translateY(-2px) scale(1.03);
    box-shadow: 0 4px 12px rgba(8, 145, 178, 0.25);
  }

  &:active {
    transform: translateY(1px) scale(0.97);
    box-shadow: 0 2px 4px rgba(8, 145, 178, 0.15);
  }
}
</style>
