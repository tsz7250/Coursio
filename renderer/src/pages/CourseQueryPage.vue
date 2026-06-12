<template>
  <div ss-container id="section-School-timetable-Query" class="inner-section is-shown">
    <AppTopBar
      title="課程查詢"
      :title-large="true"
      :is-logged-in="isLoggedIn"
      :sid="Store.sid || ''"
      :show-user-menu="Store.showUserMenu"
      @update:show-user-menu="Store.showUserMenu = $event"
      @settings="goToSettings"
      @logout="logout"
    />

    <!-- Scroll Content -->
    <div class="scroll-content scroll-content-wide">
      <!-- Tab Bar -->
      <div class="query-tab-bar">
        <button class="query-tab" :class="{ active: queryType === 'dept' }" @click="queryType = 'dept'">系所查詢</button>
        <button class="query-tab" :class="{ active: queryType === 'courseName' }" @click="queryType = 'courseName'">課程關鍵字</button>
        <button class="query-tab" :class="{ active: queryType === 'teacherName' }" @click="queryType = 'teacherName'">教師姓名</button>
        <button class="query-tab" :class="{ active: queryType === 'courseTime' }" @click="queryType = 'courseTime'">時間查詢</button>
      </div>

      <!-- Search Panel -->
      <div class="query-search-panel">
        <!-- 系所查詢 -->
        <div v-show="queryType === 'dept'" class="flex flex-wrap items-end gap-x-4">
          <div class="form-group w-1/2 md:w-1/4 narrow" :class="{'form-group-error': formErrors['querySelectSemester']}">
            <label for="querySelectSemester" class="form-label">學期</label>
            <select v-model="querySelectSemester" id="querySelectSemester"
              class="form-select" :class="{'form-validation-error': formErrors['querySelectSemester']}" :disabled="isCourseDataLoading">
              <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
              <option v-else value="" selected disabled>選擇學期...</option>
              <option v-for="semester in semesterList" :key="semester.value" :value="semester.value">{{ semester.text }}</option>
            </select>
          </div>
          <div class="form-group w-1/2 md:w-1/4 narrow" :class="{'form-group-error': formErrors['querySelectQueryDept']}">
            <label for="querySelectQueryDept" class="form-label">系所</label>
            <select v-model="querySelectQueryDept" id="querySelectQueryDept"
              class="form-select" :class="{'form-validation-error': formErrors['querySelectQueryDept']}" :disabled="isCourseDataLoading">
              <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
              <option v-else value="" selected disabled>選擇系所...</option>
              <option v-for="dept_name in deptList" :key="dept_name" :value="dept_name">{{ dept_name }}</option>
            </select>
          </div>
          <div class="form-group w-1/2 md:w-1/4 narrow" :class="{'form-group-error': formErrors['querySelectGrade']}">
            <label for="querySelectGrade" class="form-label">開課年級</label>
            <select v-model="querySelectGrade" id="querySelectGrade"
              class="form-select" :class="{'form-validation-error': formErrors['querySelectGrade']}" :disabled="isCourseDataLoading">
              <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
              <option v-else value="" selected disabled>選擇年級...</option>
              <option value="0">全部</option>
              <option value="1">1年級</option>
              <option value="2">2年級</option>
              <option value="3">3年級</option>
              <option value="4">4年級</option>
            </select>
          </div>
          <div class="form-group w-full md:w-1/4 query-actions">
            <label class="form-label">&nbsp;</label>
            <button class="btn btn-cyan w-full" @click="performDeptQuery" :disabled="isCourseDataLoading">
              <i data-lucide="search"></i> 送出查詢
            </button>
          </div>
        </div>

        <!-- 課程關鍵字查詢 -->
        <div v-show="queryType === 'courseName'" class="flex flex-wrap items-end gap-x-4">
          <div class="form-group w-1/2 md:w-1/4 narrow" :class="{'form-group-error': formErrors['querySelectSemesterForName']}">
            <label for="querySelectSemesterForName" class="form-label">學期</label>
            <select v-model="querySelectSemesterForName" id="querySelectSemesterForName"
              class="form-select" :class="{'form-validation-error': formErrors['querySelectSemesterForName']}" :disabled="isCourseDataLoading">
              <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
              <option v-else value="" selected disabled>選擇學期...</option>
              <option v-for="semester in semesterList" :key="semester.value" :value="semester.value">{{ semester.text }}</option>
            </select>
          </div>
          <div class="form-group w-1/2 md:w-1/2 medium" :class="{'form-group-error': formErrors['queryInputQueryCourseName']}">
            <label for="queryInputQueryCourseName" class="form-label">課程關鍵字</label>
            <input v-model="queryInputQueryCourseName" type="text" class="form-control"
              :class="{'form-validation-error': formErrors['queryInputQueryCourseName']}" id="queryInputQueryCourseName" placeholder="請輸入課程關鍵字" :disabled="isCourseDataLoading">
          </div>
          <div class="form-group w-full md:w-1/4 query-actions">
            <label class="form-label">&nbsp;</label>
            <button class="btn btn-cyan w-full" @click="performNameQuery" :disabled="isCourseDataLoading">
              <i data-lucide="search"></i> 送出查詢
            </button>
          </div>
        </div>

        <!-- 教師姓名查詢 -->
        <div v-show="queryType === 'teacherName'" class="flex flex-wrap items-end gap-x-4">
          <div class="form-group w-1/2 md:w-1/4 narrow" :class="{'form-group-error': formErrors['querySelectSemesterForTeacher']}">
            <label for="querySelectSemesterForTeacher" class="form-label">學期</label>
            <select v-model="querySelectSemesterForTeacher" id="querySelectSemesterForTeacher"
              class="form-select" :class="{'form-validation-error': formErrors['querySelectSemesterForTeacher']}" :disabled="isCourseDataLoading">
              <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
              <option v-else value="" selected disabled>選擇學期...</option>
              <option v-for="semester in semesterList" :key="semester.value" :value="semester.value">{{ semester.text }}</option>
            </select>
          </div>
          <div class="form-group w-1/2 md:w-1/2 medium" :class="{'form-group-error': formErrors['queryInputQueryTeacherName']}">
            <label for="queryInputQueryTeacherName" class="form-label">教師姓名</label>
            <input v-model="queryInputQueryTeacherName" type="text" class="form-control"
              :class="{'form-validation-error': formErrors['queryInputQueryTeacherName']}" id="queryInputQueryTeacherName" placeholder="請輸入教師姓名" :disabled="isCourseDataLoading">
          </div>
          <div class="form-group w-full md:w-1/4 query-actions">
            <label class="form-label">&nbsp;</label>
            <button class="btn btn-cyan w-full" @click="performTeacherQuery" :disabled="isCourseDataLoading">
              <i data-lucide="search"></i> 送出查詢
            </button>
          </div>
        </div>

        <!-- 時間查詢 -->
        <div v-show="queryType === 'courseTime'" class="flex flex-wrap items-end gap-x-4">
          <div class="form-group w-1/2 md:w-1/4 narrow" :class="{'form-group-error': formErrors['querySelectSemesterForTime']}">
            <label for="querySelectSemesterForTime" class="form-label">學期</label>
            <select v-model="querySelectSemesterForTime" id="querySelectSemesterForTime"
              class="form-select" :class="{'form-validation-error': formErrors['querySelectSemesterForTime']}" :disabled="isCourseDataLoading">
              <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
              <option v-else value="" selected disabled>選擇學期...</option>
              <option v-for="semester in semesterList" :key="semester.value" :value="semester.value">{{ semester.text }}</option>
            </select>
          </div>
          <div class="form-group w-1/2 md:w-1/4 narrow" :class="{'form-group-error': formErrors['querySelectQueryDay']}">
            <label for="querySelectQueryDay" class="form-label">星期</label>
            <select v-model="querySelectQueryDay" id="querySelectQueryDay"
              class="form-select" :class="{'form-validation-error': formErrors['querySelectQueryDay']}" :disabled="isCourseDataLoading">
              <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
              <option v-else value="" selected disabled>選擇星期幾...</option>
              <option value="1">星期一</option>
              <option value="2">星期二</option>
              <option value="3">星期三</option>
              <option value="4">星期四</option>
              <option value="5">星期五</option>
              <option value="6">星期六</option>
              <option value="7">星期日</option>
            </select>
          </div>
          <div class="form-group w-1/2 md:w-1/4 narrow" :class="{'form-group-error': formErrors['querySelectQueryPeriod']}">
            <label for="querySelectQueryPeriod" class="form-label">節次</label>
            <select v-model="querySelectQueryPeriod" id="querySelectQueryPeriod"
              class="form-select" :class="{'form-validation-error': formErrors['querySelectQueryPeriod']}" :disabled="isCourseDataLoading">
              <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
              <option v-else value="" selected disabled>選擇第幾節...</option>
              <option value="01">第 1 節 08:10~09:00</option>
              <option value="02">第 2 節 09:10~10:00</option>
              <option value="03">第 3 節 10:10~11:00</option>
              <option value="04">第 4 節 11:10~12:00</option>
              <option value="05">第 5 節 12:10~13:00</option>
              <option value="06">第 6 節 13:10~14:00</option>
              <option value="07">第 7 節 14:10~15:00</option>
              <option value="08">第 8 節 15:10~16:00</option>
              <option value="09">第 9 節 16:10~17:00</option>
              <option value="10">第 10 節 17:10~18:00</option>
              <option value="11">第 11 節 18:30~19:20</option>
              <option value="12">第 12 節 19:30~20:20</option>
              <option value="13">第 13 節 20:30~21:20</option>
            </select>
          </div>
          <div class="form-group w-full md:w-1/4 query-actions">
            <label class="form-label">&nbsp;</label>
            <button class="btn btn-cyan w-full" @click="performTimeQuery" :disabled="isCourseDataLoading">
              <i data-lucide="search"></i> 送出查詢
            </button>
          </div>
        </div>
      </div>

      <!-- 上方分頁控制 -->
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-x-4 mb-4">
        <button class="btn btn-ghost btn-sm" :disabled="currentPage === 1" @click="currentPage--">
          <i data-lucide="chevron-left" class="icon-16"></i> 上一頁
        </button>
        <span class="u-font-sm">
          第 {{ currentPage }} / {{ totalPages }} 頁（共 {{ queryResultForList.length }} 筆）
        </span>
        <button class="btn btn-ghost btn-sm" :disabled="currentPage === totalPages" @click="currentPage++">
          下一頁 <i data-lucide="chevron-right" class="icon-16"></i>
        </button>
        <div class="flex items-center gap-x-1 ml-2">
          <select v-model="pageSize" class="form-select w-auto select-sm" style="padding: 4px 24px 4px 8px; font-size: 13px; height: 32px;">
            <option :value="20">20 筆/頁</option>
            <option :value="50">50 筆/頁</option>
            <option :value="100">100 筆/頁</option>
          </select>
        </div>
      </div>

      <!-- Results -->
      <CourseResultsTable
        :courses="paginatedCourses"
        :is-logged-in="isLoggedIn"
        :query-year="querySelectQueryYear"
        :query-smtr="querySelectQuerySmt"
        @show-detail="handleShowDetail"
      />
      <!-- 下方分頁控制 -->
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-x-4 mt-4 pb-4">
        <button class="btn btn-ghost btn-sm" :disabled="currentPage === 1" @click="currentPage--">
          <i data-lucide="chevron-left" class="icon-16"></i> 上一頁
        </button>
        <span class="u-font-sm">
          第 {{ currentPage }} / {{ totalPages }} 頁（共 {{ queryResultForList.length }} 筆）
        </span>
        <button class="btn btn-ghost btn-sm" :disabled="currentPage === totalPages" @click="currentPage++">
          下一頁 <i data-lucide="chevron-right" class="icon-16"></i>
        </button>
        <div class="flex items-center gap-x-1 ml-2">
          <select v-model="pageSize" class="form-select w-auto select-sm" style="padding: 4px 24px 4px 8px; font-size: 13px; height: 32px;">
            <option :value="20">20 筆/頁</option>
            <option :value="50">50 筆/頁</option>
            <option :value="100">100 筆/頁</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, nextTick, watch } from 'vue';
import { Store } from '../store.js';
import CourseResultsTable from '../components/course/CourseResultsTable.vue';
import AppTopBar from '@/components/layout/AppTopBar.vue';
import { useCourseQuery } from '@/composables/useCourseQuery.js';

const {
    queryType,
    querySelectQueryYear,
    querySelectQuerySmt,
    querySelectSemester,
    querySelectQueryDept,
    querySelectGrade,
    querySelectSemesterForName,
    queryInputQueryCourseName,
    querySelectSemesterForTeacher,
    queryInputQueryTeacherName,
    querySelectSemesterForTime,
    querySelectQueryDay,
    querySelectQueryPeriod,
    queryResultForList,
    isCourseDataLoading,
    isLoggedIn,
    deptList,
    semesterList,
    currentPage,
    pageSize,
    totalPages,
    paginatedCourses,
    formErrors,
    goToSettings,
    logout,
    performDeptQuery,
    performNameQuery,
    performTeacherQuery,
    performTimeQuery,
    handleShowDetail,
    getCourseListForQuery,
} = useCourseQuery();

onMounted(() => {
  if (Store.allCourseList && Store.allCourseList.length > 0) {
    Store.courseList = Store.allCourseList;
  } else if (Store.courseList.length === 0) {
    getCourseListForQuery();
  }
  if (Store.semesterListForTime.length > 0 && !querySelectSemester.value) {
    const latest = Store.semesterListForTime[0].value;
    querySelectSemester.value = latest;
    querySelectSemesterForName.value = latest;
    querySelectSemesterForTeacher.value = latest;
    querySelectSemesterForTime.value = latest;
  }
  nextTick(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); });
});

watch([currentPage, totalPages, pageSize], () => {
  nextTick(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); });
});
</script>

<style scoped lang="scss">
/* 查詢頁面專屬佈局 */
.inner-section {
  width: 100%;
  height: 100%;
  position: relative;
  overflow-y: auto;
  background: var(--color-bg-page);
}

/* 查詢分頁標籤 */
.query-tab-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 1px solid #E2E8F0;
  padding-bottom: 2px;
}

.query-tab {
  padding: 8px 16px;
  font-family: 'Poppins', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #64748B;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;

  &:hover { color: #0891B2; }
  &.active {
    color: #0891B2;
    border-bottom-color: #0891B2;
  }
}

/* 查詢面板 */
.query-search-panel {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.query-actions {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

/* 表單輔助樣式 */
.form-group.narrow { max-width: 320px; }
.form-group.medium { max-width: 480px; }

/* 響應式調整 */
@media (max-width: 768px) {
  .query-search-panel { padding: 16px; }
  .form-group.narrow, .form-group.medium { max-width: 100%; }
  .query-actions { margin-top: 12px; }
}
</style>
