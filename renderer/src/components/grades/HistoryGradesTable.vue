<template>
  <div class="grades-content-section" v-if="courses">
    <!-- Summary Row -->
    <div class="grades-summary-row">
      <span class="summary-title">全部學年度成績彙整</span>
      <span class="grades-stat">累計學分：{{ summary.totalCredits }}</span>
      <span class="grades-stat">已過學分：{{ summary.passedCredits }}</span>
      <span class="grades-stat">歷年平均：{{ summary.overallAverage }}</span>
    </div>

    <!-- History Table -->
    <div class="grades-table-wrapper" v-if="courses.length > 0">
      <div class="grades-table">
        <div class="grades-header-row">
          <div class="grades-cell gc-no">NO</div>
          <div class="grades-cell gc-year">學年期</div>
          <div class="grades-cell gc-type">選別</div>
          <div class="grades-cell gc-code">課號</div>
          <div class="grades-cell gc-class">班別</div>
          <div class="grades-cell gc-name">課名</div>
          <div class="grades-cell gc-mid">期中評量</div>
          <div class="grades-cell gc-credit">學分</div>
          <div class="grades-cell gc-score">成績</div>
        </div>
        <div class="grades-data-row" v-for="(course, idx) in courses" :key="idx"
             :class="{ 'row-odd': idx % 2 === 0, 'row-even': idx % 2 === 1 }">
          <div class="grades-cell gc-no">{{ idx + 1 }}</div>
          <div class="grades-cell gc-year">{{ course.yearSemester }}</div>
          <div class="grades-cell gc-type">{{ course.courseType }}</div>
          <div class="grades-cell gc-code" :class="getCodeClass(course)">{{ course.courseCode }}</div>
          <div class="grades-cell gc-class">{{ course.classGroup }}</div>
          <div class="grades-cell gc-name gc-name-text">{{ course.courseName }}</div>
          <div class="grades-cell gc-mid">{{ course.midterm }}</div>
          <div class="grades-cell gc-credit">{{ course.credits }}</div>
          <div class="grades-cell gc-score" :class="getScoreClass(course.score)">{{ course.score }}</div>
        </div>
      </div>
    </div>
    <div class="grades-empty" v-else>
      <p>尚無歷年成績資料</p>
    </div>
    <span class="grades-footer-note">課程名稱後有☆者表示EMI課程</span>
  </div>
</template>

<script setup>
defineProps({
  courses: { type: Array, required: true },
  summary: { type: Object, required: true }
});

// Score color class
function getScoreClass(score) {
  if (!score) return '';
  if (score === '停修' || score === 'W') return 'score-error';
  const num = parseInt(score);
  if (isNaN(num)) return '';
  if (num < 60) return 'score-warning';
  return 'score-highlight';
}

// Code class (red for withdrawn courses)
function getCodeClass(course) {
  if (course.score === '停修' || course.score === 'Withdrawal') return 'code-error';
  return '';
}
</script>

<style scoped lang="scss">
.grades-content-section {
  display: flex;
  flex-direction: column;
}

// Summary Row
.grades-summary-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;

  .summary-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
}

.grades-stat {
  font-size: 14px;
  color: var(--color-text-secondary);
  padding: 6px 12px;
  background: var(--color-bg-page);
  border-radius: 8px;
  white-space: nowrap;
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

  &.gc-no { flex: 0 0 40px; white-space: nowrap; }
  &.gc-year { flex: 0 0 70px; white-space: nowrap; }
  &.gc-type { flex: 0 0 110px; white-space: nowrap; }
  &.gc-code { flex: 0 0 90px; font-family: monospace; white-space: nowrap; }
  &.gc-class { flex: 0 0 50px; white-space: nowrap; }
  &.gc-name { flex: 1; justify-content: flex-start; text-align: left; }
  &.gc-mid { flex: 0 0 70px; white-space: nowrap; }
  &.gc-credit { flex: 0 0 55px; white-space: nowrap; }
  &.gc-score { flex: 0 0 65px; font-weight: 600; white-space: nowrap; }
}

.grades-empty {
  padding: 40px;
  text-align: center;
  color: var(--color-text-secondary);
}

.grades-footer-note {
  display: block;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 12px;
  text-align: right;
}

.code-error { color: var(--color-danger); }
.score-error { color: var(--color-danger); }
.score-warning { color: var(--color-warning); font-weight: 700; }
.score-highlight { color: var(--color-primary); font-weight: 700; font-size: 14px; }
</style>
