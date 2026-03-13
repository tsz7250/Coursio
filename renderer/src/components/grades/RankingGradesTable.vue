<template>
  <div class="grades-content-section" v-if="rows">
    <!-- Student Info Card -->
    <div class="grades-student-info" v-if="studentInfo && studentInfo.studentId">
      <div class="student-info-title">歷學期排名查詢結果</div>
      <div class="student-info-row horizontal-info">
        <span class="info-label">學制：</span><span class="info-value">{{ studentInfo.system }}</span>
        <span class="info-label ml-4">系別（年級/班）：</span><span class="info-value">{{ studentInfo.department }}</span>
        <span class="info-label ml-4">學號：</span><span class="info-value">{{ studentInfo.studentId }}</span>
        <span class="info-label ml-4">姓名：</span><span class="info-value">{{ studentInfo.name }}</span>
      </div>
    </div>

    <!-- Ranking Table -->
    <div class="grades-table-wrapper" v-if="rows.length > 0">
      <div class="grades-table">
        <div class="grades-header-row">
          <div class="grades-cell gc-fill">學年度</div>
          <div class="grades-cell gc-fill">學期</div>
          <div class="grades-cell gc-fill flex-2">班級排名/班級人數</div>
          <div class="grades-cell gc-fill flex-2">學系排名/學系人數</div>
          <div class="grades-cell gc-fill">總平均成績</div>
        </div>
        <div class="grades-data-row" v-for="(row, idx) in rows" :key="idx"
             :class="{ 'row-odd': idx % 2 === 0, 'row-even': idx % 2 === 1 }">
          <div class="grades-cell gc-fill">{{ row.year }}</div>
          <div class="grades-cell gc-fill">{{ row.semester }}</div>
          <div class="grades-cell gc-fill flex-2">
            {{ row.classRankNum }}/{{ row.classTotalNum }} 
            <span class="rank-percent" v-if="row.classTotalNum > 0">({{ ((row.classRankNum / row.classTotalNum) * 100).toFixed(2) }}%)</span>
          </div>
          <div class="grades-cell gc-fill flex-2">
            {{ row.deptRankNum }}/{{ row.deptTotalNum }} 
            <span class="rank-percent" v-if="row.deptTotalNum > 0">({{ ((row.deptRankNum / row.deptTotalNum) * 100).toFixed(2) }}%)</span>
          </div>
          <div class="grades-cell gc-fill score-highlight">{{ row.average ? row.average.toFixed(2) : '' }}</div>
        </div>
      </div>
    </div>
    <div class="grades-empty" v-else>
      <p>尚無排名資料</p>
    </div>

    <!-- Notes -->
    <div class="grades-notes">
      <span class="notes-title">備註</span>
      <p>• 排名資料會因學生成績異動而更改，以最近查詢結果為依據。</p>
      <p>• 開放學期排名查詢時間：新學期開學後第三週的星期一。</p>
      <p>• 如需紙本成績單請至教務處註冊組申請。</p>
    </div>
  </div>
</template>

<script setup>
defineProps({
  rows: { type: Array, required: true },
  studentInfo: { type: Object, required: false }
});
</script>

<style scoped lang="scss">
.grades-content-section {
  display: flex;
  flex-direction: column;
}

// Student Info Card
.grades-student-info {
  background: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 20px;

  .student-info-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--color-border);
  }

  .horizontal-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    
    .ml-4 { margin-left: 16px; }
  }

  .info-label { color: var(--color-text-secondary); }
  .info-value { font-weight: 600; color: var(--color-text-primary); }
}

// Table Styles
.grades-table-wrapper {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.grades-table {
  width: 100%;
  display: table;
  border-collapse: collapse;
}

.grades-header-row {
  display: flex;
  background: var(--color-primary);
  color: white;

  .grades-cell {
    font-weight: 600;
    font-size: 13px;
    padding: 10px 8px;
  }
}

.grades-data-row {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  transition: background 0.15s;

  &:last-child { border-bottom: none; }
  &.row-odd { background: var(--color-bg-card); }
  &.row-even { background: var(--color-bg-page); }
  &:hover { background: rgba(var(--color-primary-rgb, 0, 122, 255), 0.05); }
}

.grades-cell {
  padding: 10px 8px;
  font-size: 13px;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;

  &.gc-fill { flex: 1; }
  &.flex-2 { flex: 2; }
}

.rank-percent {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-left: 4px;
}

.grades-empty {
  padding: 40px;
  text-align: center;
  color: var(--color-text-secondary);
}

.score-highlight { color: var(--color-primary); font-weight: 700; font-size: 14px; }

// Notes
.grades-notes {
  margin-top: 24px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 8px;
  border-left: 4px solid var(--color-warning);

  .notes-title {
    display: block;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 8px;
    font-size: 14px;
  }

  p {
    margin: 4px 0 0;
    font-size: 13px;
    color: #64748b;
    line-height: 1.5;
  }
}
</style>
