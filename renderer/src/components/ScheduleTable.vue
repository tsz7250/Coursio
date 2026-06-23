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
            
            <div class="schedule-cell-inner" 
                 v-if="scheduleGrid[timeIndex][dayIndex - 1] && scheduleGrid[timeIndex][dayIndex - 1].length > 0"
                 :class="{ 
                   'has-multiple': scheduleGrid[timeIndex][dayIndex - 1].length > 1,
                   'expand-up': timeIndex >= 8
                 }"
                 :data-count="scheduleGrid[timeIndex][dayIndex - 1].length - 1">
              <div v-for="(course, courseIdx) in scheduleGrid[timeIndex][dayIndex - 1]" 
                   :key="courseIdx" 
                   class="course-block">
                <span class="sched-cn">
                  <span v-if="course.groupId" class="grid-group-badge" :style="{ backgroundColor: getGroupColor(course.groupId).bg, color: getGroupColor(course.groupId).text }">
                    G{{ course.groupId }}
                  </span>
                  {{ course.name }}
                </span>
                <span class="sched-cc">{{ course.code }}</span>
                <span class="sched-cr">{{ course.roomDisplay }}</span>
              </div>
            </div>
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
  // 建立 13 x 7 的空陣列，每個儲存格預設為空陣列
  const grid = Array.from({ length: 13 }, () => Array.from({ length: 7 }, () => []));

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
              const day = parseInt(timeSlot.charAt(0), 10);
              const periodsStr = timeSlot.substring(1);
              for (let i = 0; i < periodsStr.length; i += 2) {
                const period = parseInt(periodsStr.substring(i, i + 2), 10);
                if (!isNaN(period) && period >= 1 && period <= 13 && day >= 1 && day <= 7) {
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
  
  const exists = grid[timeIndex][dayIndex].some(c => c.code === code);
  if (!exists) {
    grid[timeIndex][dayIndex].push({
      code,
      name: course.name,
      teacher: course.teacher_name || '未知教師',
      room,
      roomDisplay,
      groupId: course.groupId
    });
  }
}

function getGroupColor(groupId) {
  if (!groupId) return { bg: 'transparent', text: 'transparent' };
  const hue = (groupId * 137.5) % 360;
  return {
    bg: `hsl(${hue}, 75%, 93%)`,
    text: `hsl(${hue}, 75%, 25%)`
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
  flex: 1; /* 預設填滿格子 */
  min-height: 38px;
  padding: 4px;
  box-sizing: border-box;
  white-space: pre-line;
  font-size: 16px;
  line-height: 1.2;
  background-color: #F0FDF4; /* 課程背景色可自訂，為了與空課表作區別 */
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-bottom: none; /* 預設單一課程無框線 */
  transition: max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1), 
              opacity 0.2s ease, 
              padding 0.25s ease, 
              margin 0.25s ease, 
              background-color 0.2s ease;
}

.schedule-cell-inner {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  justify-content: flex-start;
  align-items: stretch;
  background: white;
  box-sizing: border-box;
  transition: all 0.2s ease-in-out;

  // ponytail: use pure CSS positioning and hover states instead of complex JS portal/hover logic for light code footprint
  &.has-multiple {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: auto; /* 平時只用 top: 0 定位，避免 hover 時切換定位基準點 */
    height: auto;
    min-height: 100%;
    max-height: 80px; /* 限制在單個儲存格高度 */
    z-index: 2;
    padding: 4px; /* ponytail: lock padding to 4px to maintain symmetrical white borders consistently */
    box-sizing: border-box;
    background: #FFFBEB; /* 黃色底色暗示多重預排 */
    border: 1px dashed #F59E0B; /* 橘黃色虛線框 */
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    overflow: hidden; /* 未 Hover 時防止內容溢出 */
    transition: max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1), 
                border-color 0.2s ease, 
                box-shadow 0.2s ease,
                background-color 0.2s ease;

    /* 後半段時段預設 bottom 定位並反向生長，消除 hover 文字位移 */
    &.expand-up {
      top: auto;
      bottom: 0;
      flex-direction: column-reverse; /* ponytail: reverse layout to anchor first-child to bottom */
    }

    /* 預設非首個 block 隱藏高度與透明，用於平滑過渡 */
    .course-block {
      opacity: 0;
      max-height: 0;
      min-height: 0; /* ponytail: override default min-height 38px to avoid squeezing first child */
      padding: 0 4px;
      margin: 0;
      border-bottom: none;
      overflow: hidden;
      flex: none; /* ponytail: prevent from participating in flex distribution when collapsed */

      &:first-child {
        opacity: 1;
        max-height: 72px; /* ponytail: 80px cell height - 8px vertical padding = 72px */
        min-height: 72px; /* ponytail: lock height to 72px to avoid text alignment jitter */
        height: 72px;
        padding: 4px;
        background-color: transparent;
        flex: none;
      }
    }

    /* 右上角 +N 徽章 */
    &::after {
      content: "+" attr(data-count);
      position: absolute;
      top: 4px;
      right: 4px;
      background: #EF4444;
      color: white;
      font-size: 9px;
      font-weight: bold;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 10px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      z-index: 5;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }

    /* 模擬卡片堆疊效果的底部線條 */
    &::before {
      content: '';
      position: absolute;
      bottom: -3px;
      left: 4px;
      right: 4px;
      height: 3px;
      background: #FEF3C7;
      border: 1px dashed #F59E0B;
      border-top: none;
      border-radius: 0 0 4px 4px;
      z-index: 1;
      pointer-events: none;
      transition: opacity 0.15s ease;
    }

    /* Hover 展開 */
    &:hover {
      max-height: 600px; /* 提升至 600px 防止資訊被裁切 */
      z-index: 50;
      background: white;
      border: 1.5px solid #EF4444; /* 展開變紅實線 */
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.15);
      border-radius: 6px;
      padding: 4px; /* 展開後維持 4px 邊距 */

      &::after, &::before {
        opacity: 0; /* 用 opacity 漸隱，防止 display: none 卡頓 */
      }

      .course-block {
        opacity: 1;
        max-height: 150px; /* 提高單個 max-height，防止長名稱在 hover 時被截斷 */
        min-height: 38px;
        padding: 6px 8px; /* 加大內邊距提升美感 */
        background-color: #FEF2F2; /* 展開的課程方塊底色 */
        border-bottom: none; /* ponytail: remove redundant divider border for individual cards */
        margin: 4px 0 0 0; /* 卡片頂部預留 4px 呼吸空間 */
        border-radius: 4px;
        flex: none; /* 統一設為 flex none，徹底解決 flex 伸縮造成的跳折 */

        &:first-child {
          max-height: 72px;
          min-height: 72px;
          height: 72px;
          padding: 4px; /* 保持與預設一致的 padding */
          margin: 0; /* 保持為 0，避免與紅框產生多餘縮進，使文字完全靜止 */
          background-color: transparent; /* 保持透明以融入底色 */
          border-bottom: none; /* 移除下邊線，與預設樣式一致 */
        }

        &:hover {
          background-color: #FEE2E2; /* 滑鼠在單一課程時加深 */
        }
      }
    }
  }
}

.grid-group-badge {
  display: inline-block;
  padding: 0px 4px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  margin-right: 4px;
  vertical-align: middle;
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
  .schedule-cell-inner {
    &.has-multiple {
      max-height: 70px;
    }
  }
}
</style>
