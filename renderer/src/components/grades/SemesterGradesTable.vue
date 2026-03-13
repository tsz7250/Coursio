<template>
  <div class="grades-content-section" v-if="courses">
    <!-- Info Row -->
    <div class="grades-info-row">
      <div class="semester-dropdown" @click="toggleSemesterDropdown" ref="dropdownRef">
        <span class="dropdown-txt">{{ selectedSemesterLabel }}</span>
        <i data-lucide="chevron-down" class="icon-16"></i>
        <!-- Dropdown menu -->
        <div class="semester-dropdown-menu" v-if="showSemesterDropdown">
          <div class="semester-dropdown-item" 
               v-for="sem in availableSemesters" :key="sem.value"
               :class="{ selected: sem.value === selectedSemester }"
               @click.stop="selectSemester(sem)">
            {{ sem.text }}
          </div>
        </div>
      </div>
      <span class="grades-stat">學分小計：{{ stats.totalCredits }}</span>
      <span class="grades-stat">已過學分：{{ stats.passedCredits }}</span>
      <span class="grades-stat">平均：{{ stats.average }}</span>
    </div>

    <!-- Grades Table -->
    <div class="grades-table-wrapper" v-if="courses.length > 0">
      <div class="grades-table">
        <div class="grades-header-row">
          <div class="grades-cell gc-no">NO</div>
          <div class="grades-cell gc-year">學年期</div>
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
      <p>尚無成績資料</p>
    </div>
    <span class="grades-footer-note">課程名稱後有☆者表示EMI課程</span>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

defineProps({
  courses: { type: Array, required: true },
  stats: { type: Object, required: true },
  availableSemesters: { type: Array, required: true },
  selectedSemester: { type: String, required: true },
  selectedSemesterLabel: { type: String, required: true }
});

const emit = defineEmits(['select-semester']);

const showSemesterDropdown = ref(false);
const dropdownRef = ref(null);

function toggleSemesterDropdown() {
  showSemesterDropdown.value = !showSemesterDropdown.value;
}

function selectSemester(sem) {
  showSemesterDropdown.value = false;
  emit('select-semester', sem);
}

function handleClickOutside(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    showSemesterDropdown.value = false;
  }
}

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

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  nextTick(() => {
    if (typeof window.lucide !== 'undefined') window.lucide.createIcons();
  });
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped lang="scss">
.grades-content-section {
  display: flex;
  flex-direction: column;
}

// Info Row
.grades-info-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.grades-stat {
  font-size: 14px;
  color: var(--color-text-secondary);
  padding: 6px 12px;
  background: var(--color-bg-page);
  border-radius: 8px;
  white-space: nowrap;
}

// Dropdown
.semester-dropdown {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.2s;

  &:hover { border-color: var(--color-primary); }
  .dropdown-txt { font-size: 14px; color: var(--color-text-primary); font-weight: 500; }
}

.semester-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 200px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  z-index: 50;
  max-height: 200px;
  overflow-y: auto;
}

.semester-dropdown-item {
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  color: var(--color-text-primary);
  transition: background 0.15s;

  &:hover { background: var(--color-bg-page); }
  &.selected { color: var(--color-primary); font-weight: 600; }
  &:first-child { border-radius: 8px 8px 0 0; }
  &:last-child { border-radius: 0 0 8px 8px; }
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
