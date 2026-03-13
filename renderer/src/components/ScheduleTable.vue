<template>
  <div class="schedule-table-container">
    <table class="schedule-table">
      <thead>
        <tr>
          <th class="sched-time-col">時間</th>
          <th>週一</th>
          <th>週二</th>
          <th>週三</th>
          <th>週四</th>
          <th>週五</th>
          <th>週六</th>
          <th>週日</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(time, timeIndex) in timeSlots" :key="timeIndex">
          <!-- 第 1 欄：時間標示 -->
          <td class="schedule-time-cell">
            第{{ timeIndex + 1 }}節<br />{{ time }}
          </td>

          <!-- 第 2~8 欄：星期一到日 -->
          <td v-for="(dayIndex) in 7" :key="dayIndex" class="schedule-cell">
            
            <template v-if="scheduleGrid[timeIndex][dayIndex - 1]">
              <div class="course-block">
                <span class="sched-cn">{{ scheduleGrid[timeIndex][dayIndex - 1].name }}</span>
                <span class="sched-cc">{{ scheduleGrid[timeIndex][dayIndex - 1].code }}</span>
                <span class="sched-cr">{{ scheduleGrid[timeIndex][dayIndex - 1].roomDisplay }}</span>
              </div>
            </template>
            <template v-else>
              <div class="schedule-course-slot">-</div>
            </template>

          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  scheduleData: {
    type: Object,
    default: () => null
  }
});

const timeSlots = [
  '08:10-09:00', '09:10-10:00', '10:10-11:00', '11:10-12:00',
  '12:10-13:00', '13:10-14:00', '14:10-15:00', '15:10-16:00',
  '16:10-17:00', '17:10-18:00', '18:30-19:20', '19:25-20:15',
  '20:20-21:10',
];

// Computed Property：依據傳入的 scheduleData 產生 13節 x 7天 的陣列
const scheduleGrid = computed(() => {
  // 建立 13 x 7 的空陣列
  const grid = Array.from({ length: 13 }, () => Array(7).fill(null));

  if (!props.scheduleData || !props.scheduleData.is_personal) {
    return grid;
  }

  const courses = props.scheduleData.course_list || [];

  courses.forEach((course) => {
    // 優先使用 course.day 和 course.period
    if (course.day && course.period) {
      const day = course.day;
      const period = course.period;
      if (period >= 1 && period <= 13 && day >= 1 && day <= 7) {
        insertCourseToGrid(grid, period - 1, day - 1, course);
      }
    } 
    // 次優先解析 course.time 字串 (如 "第 3 節" 或 "123" )
    else if (course.time && course.time !== '無課程資料' && course.time !== '時間待確認') {
      if (course.time.includes('第') && course.time.includes('節')) {
        const periodMatch = course.time.match(/第\s*(\d+)\s*節/);
        if (periodMatch) {
          const period = parseInt(periodMatch[1]);
          if (period >= 1 && period <= 13) {
            // 這個格式沒有指明星期，舊實作中強迫放在週一的對應節次
            insertCourseToGrid(grid, period - 1, 0, course);
          }
        }
      } else {
        // "123, 234" 格式: day + periods
        const timeInfo = course.time.split(',');
        timeInfo.forEach((timeSlot) => {
          if (timeSlot && timeSlot.length >= 3) {
            try {
              const day = parseInt(timeSlot.charAt(0));
              const periods = timeSlot.substring(1);
              for (let i = 0; i < periods.length; i++) {
                const period = parseInt(periods.charAt(i));
                if (period >= 1 && period <= 13 && day >= 1 && day <= 7) {
                  insertCourseToGrid(grid, period - 1, day - 1, course);
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

  return grid;
});

// Helper 函數：用於統一資料格式填入 Grid
function insertCourseToGrid(grid, timeIndex, dayIndex, course) {
  const code = (`${course.cos_id || course.course_id || ''}`).trim().replace(/\s*\(\s*\d+\s*\)\s*$/, '');
  const room = course.room || '未知教室';
  const roomDisplay = room.split('*')[0].split('\n')[0].trim();
  
  grid[timeIndex][dayIndex] = {
    code,
    name: course.name,
    teacher: course.teacher_name || '未知教師',
    room,
    roomDisplay
  };
}
</script>

<style scoped lang="scss">
.schedule-table-container {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: white;
}

.schedule-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 800px;
  table-layout: fixed; /* 固定表格排版，讓週一到週日強制平分剩下寬度，避免文字擠壓 */
}

.schedule-table th, .schedule-table td {
  border: 1px solid var(--color-border);
  padding: 8px;
  text-align: center;
}

.schedule-table th {
  background: var(--color-primary);
  color: white;
  font-weight: 600;
}

.sched-time-col {
  width: 80px;
}

/* 課表格子 */
.schedule-cell {
  height: 80px;
  padding: 0; /* 移除 padding 使內部方塊能貼齊框線 */
  vertical-align: middle;
  position: relative;
}

/* 時間欄（第一欄） */
.schedule-time-cell {
  background-color: #F8FFFE;
  font-weight: bold;
  white-space: pre-line;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* 課程方塊 */
.course-block {
  width: 100%;
  height: 100%;
  padding: 4px;
  box-sizing: border-box;
  white-space: pre-line;
  font-size: 16px;
  line-height: 1.2;
  background-color: #F0FDF4; /* 課程背景色可自訂，為了與空課表作區別 */
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.schedule-course-slot {
  padding: 8px;
  text-align: center;
  color: #94A3B8;
}

.sched-cn {
  font-weight: 600;
  font-size: 13px;
  color: #0891B2;
  margin-bottom: 2px;
}

.sched-cc, .sched-cr {
  font-size: 11px;
  color: #64748B;
}

@media (max-width: 768px) {
  .schedule-cell {
    width: 100px;
    height: 70px;
  }
}
</style>
