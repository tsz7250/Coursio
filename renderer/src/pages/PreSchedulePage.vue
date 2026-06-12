<template>
  <div ss-container id="section-PreSchedule" class="inner-section is-shown">
    <AppTopBar
      title="預排課表"
      :title-large="true"
      :is-logged-in="isLoggedIn"
      :sid="sid || ''"
      :show-user-menu="Store.showUserMenu"
      @update:show-user-menu="Store.showUserMenu = $event"
      @settings="goToSettings"
      @logout="logout"
    />

    <!-- Scroll Content -->
    <div class="scroll-content scroll-content-wide">
      <!-- Tool Row -->
      <div class="sched-tool-row">
        <div class="sched-tool-left">
          <span class="sched-semester-label">新學期預排課程</span>
          <span class="badge badge-primary">{{ creditCount }} 學分</span>
        </div>
        <div class="sched-tool-right">
          <button class="btn btn-outline" @click="loadTaskList">
            <i data-lucide="refresh-cw"></i> 重新整理
          </button>
        </div>
      </div>

      <!-- Schedule Table -->
      <div id="schedule-content">
        <ScheduleTable :scheduleData="preScheduleData" />
      </div>

      <!-- 預排課程清單 -->
      <div class="pre-schedule-list-card">
        <div class="card-header">
          <i data-lucide="list-checks" class="icon-clr-primary"></i>
          <span class="card-title">預排課程清單</span>
          <span class="badge badge-info">{{ taskList.length }} 門課</span>
        </div>
        <div class="table-wrap">
          <table class="pre-schedule-table">
            <thead>
              <tr>
                <th>課程代號</th>
                <th>課程名稱</th>
                <th>教師</th>
                <th>時間</th>
                <th>教室</th>
                <th>學分</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="taskList.length === 0" class="empty-row">
                <td colspan="7">
                  <div class="empty-content">
                    <i data-lucide="info" class="icon-clr-muted"></i>
                    <p>尚無預排課程</p>
                    <small>請前往「課程查詢」頁面加入課程</small>
                  </div>
                </td>
              </tr>
              <tr v-for="task in taskList" :key="task.id">
                <td class="course-code">{{ task.cos_id }}{{ task.cos_class }}</td>
                <td class="course-name" :title="task.name">{{ task.name }}</td>
                <td>{{ task.teacher_name || '-' }}</td>
                <td>{{ formatDisplayTime(task.time) }}</td>
                <td>{{ task.room || '-' }}</td>
                <td>{{ task.credit || '0' }}</td>
                <td class="actions">
                  <button @click="deleteTask(task)" class="btn btn-outline btn-sm">🗑️ 刪除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import ScheduleTable from '../components/ScheduleTable.vue';
import { Store } from '../store.js';
import AppTopBar from '@/components/layout/AppTopBar.vue';
import { useLogout } from '@/composables/useLogout.js';

const router = useRouter();
function goToSettings() { router.push({ name: 'Settings' }); Store.showUserMenu = false; }
const { logout } = useLogout();

const isLoggedIn = computed(() => Store.isLoggedIn);
const sid = computed(() => Store.sid);

const taskList = ref([]);

async function loadTaskList() {
  try {
    const tasks = await window.electronAPI.db.getAllTasks();
    taskList.value = tasks || [];
  } catch (err) {
    console.error('載入預排任務失敗:', err);
  }
}

async function deleteTask(task) {
  if (!task) {
    alert('錯誤：未選取刪除目標！');
    return;
  }
  let confirmed = false;
  try {
    const confirmFn = window.customConfirm || ((msg) => Promise.resolve(window.confirm(msg)));
    confirmed = await confirmFn(`確定要將「${task.name}」移出預排課表嗎？`, '刪除預排課程');
  } catch (confirmError) {
    alert('確認視窗執行出錯: ' + (confirmError?.message || confirmError));
    return;
  }
  if (!confirmed) return;

  try {
    await window.electronAPI.db.deleteTask(task.id);
    if (typeof M !== 'undefined' && M.toast) {
      M.toast({ html: `🗑️ 已將 「${task.name}」 移出預排課表`, displayLength: 3000 });
    }
    await loadTaskList();
  } catch (err) {
    console.error('刪除預排任務失敗:', err);
  }
}

const creditCount = computed(() => {
  return taskList.value.reduce((sum, task) => sum + (task.credit || 0), 0);
});

// ── 時間格式解析與智慧拆分（時間與教室精確配對） ──
function getCourseSubItems(task) {
  const timeField = task.time || '';
  const pairs = [];
  
  if (timeField.includes(':')) {
    const segments = timeField.split(';');
    segments.forEach(seg => {
      const parts = seg.split(':');
      const t = parts[0] ? parts[0].trim() : '';
      const r = parts[1] ? parts[1].trim() : '';
      if (t) {
        pairs.push({ time: t, room: r || '未知教室' });
      }
    });
  } else {
    // NULL 或舊格式 Fallback
    if (timeField) {
      pairs.push({ time: timeField, room: task.room || '未知教室' });
    }
  }
  
  if (pairs.length === 0) {
    return [{
      cos_id: task.cos_id,
      course_id: task.cos_id,
      cos_class: task.cos_class,
      name: task.name,
      teacher_name: task.teacher_name,
      room: task.room || '未知教室',
      time: ''
    }];
  }
  
  // 按教室分組時間代碼
  const groups = {};
  pairs.forEach(p => {
    const roomName = p.room || '未知教室';
    if (!groups[roomName]) groups[roomName] = [];
    groups[roomName].push(p.time);
  });
  
  const subItems = [];
  for (const [roomName, times] of Object.entries(groups)) {
    subItems.push({
      cos_id: task.cos_id,
      course_id: task.cos_id,
      cos_class: task.cos_class,
      name: task.name,
      teacher_name: task.teacher_name,
      room: roomName,
      time: times.join(',')
    });
  }
  return subItems;
}

function formatDisplayTime(timeStr) {
  if (!timeStr) return '-';
  const segments = timeStr.split(/[;,]/);
  const times = [];
  segments.forEach(seg => {
    const trimmed = seg.trim();
    if (trimmed) {
      if (trimmed.includes(':')) {
        const parts = trimmed.split(':');
        const t = parts[0] ? parts[0].trim() : '';
        if (t) times.push(t);
      } else {
        times.push(trimmed);
      }
    }
  });
  return times.length > 0 ? times.join(', ') : '-';
}

// 將 tasks 轉換成 ScheduleTable 所需的格式
const preScheduleData = computed(() => {
  return {
    is_personal: true,
    course_list: taskList.value.flatMap(task => getCourseSubItems(task))
  };
});

onMounted(async () => {
  await loadTaskList();
  nextTick(() => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });
});
</script>

<style scoped lang="scss">
.inner-section {
  width: 100%;
  height: 100%;
  position: relative;
  overflow-y: auto;
  background: var(--color-bg-page);
}

.pre-schedule-list-card {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  padding: 24px;
  border-radius: 12px;
  margin-top: 24px;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    
    .card-title {
      font-family: 'Poppins', sans-serif;
      font-size: 16px;
      font-weight: 600;
      color: #164E63;
      margin: 0;
    }
  }
}

.table-wrap {
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  overflow: hidden;
  margin-top: 12px;
}

.pre-schedule-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'Open Sans', sans-serif;
  font-size: 13px;

  thead tr {
    background: #F8FAFC;
    border-bottom: 1px solid #E2E8F0;
  }

  th {
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 700;
    color: #64748B;
    text-transform: uppercase;
    text-align: left;
  }

  tbody tr {
    border-bottom: 1px solid #F1F5F9;
    &:hover {
      background: #F8FAFC;
    }
  }

  td {
    padding: 12px;
    color: #334155;
    vertical-align: middle;
  }
}

.course-code {
  font-weight: 600;
  color: #64748B;
}

.course-name {
  font-weight: 600;
  color: #0891B2;
}

.empty-row {
  text-align: center;
  
  .empty-content {
    padding: 30px 20px;
    color: #94A3B8;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;

    svg {
      width: 24px;
      height: 24px;
    }

    p {
      margin: 0;
      font-weight: 600;
      font-size: 14px;
    }

    small {
      font-size: 12px;
    }
  }
}

.icon-clr-primary {
  color: #0891B2;
}
</style>
