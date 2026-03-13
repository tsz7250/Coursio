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
          <col><col><col><col><col><col><col><col>
        </colgroup>
        <thead>
          <tr>
            <th>課號班別</th>
            <th>開課系級</th>
            <th>課程名稱</th>
            <th>選別</th>
            <th>時間,教室</th>
            <th>授課教師</th>
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
            <td class="credit-cell">
              <span v-if="course.credit_loading" class="credit-loading">載入中...</span>
              <span v-else-if="course.credit" class="credit-value">{{ course.credit }}</span>
              <span v-else class="credit-unknown">-</span>
            </td>
            <td>
              <span v-if="isLoggedIn" @click.capture.self="addToSchedule($event, course)"
                class="btn btn-cyan btn-sm hvr-bounce-to-right point-it">加入</span>
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

const props = defineProps({
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

async function addToSchedule(event, course) {
  event.preventDefault();
  event.stopPropagation();
  try {
    const courseData = {
      cos_id: course.cos_id || '',
      cos_class: course.cos_class || 'A',
      name: course.name || course.cos_name || '',
      teacher_name: course.teacher_name || course.teacher || '',
      credit: course.credit || course.credits || 0,
      dept_id: course.dept_id || '',
      status: 0
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
    const result = await window.electronAPI.db.addTask(courseData);
    if (result && result.id) {
      if (typeof M !== 'undefined' && M.toast) M.toast({ html: `已加入 ${courseData.cos_id}${courseData.cos_class} - ${courseData.name}`, displayLength: 3000 });
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
    year: props.queryYear,
    smtr: props.querySmtr,
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
  colgroup col:nth-child(1) { width: 110px; }
  colgroup col:nth-child(2) { width: 180px; }
  colgroup col:nth-child(3) { width: auto; }
  colgroup col:nth-child(4) { width: 80px; }
  colgroup col:nth-child(5) { width: 220px; }
  colgroup col:nth-child(6) { width: 100px; }
  colgroup col:nth-child(7) { width: 80px; }
  colgroup col:nth-child(8) { width: 120px; }

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
</style>
