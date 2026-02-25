// CourseQueryPage.js — 課程查詢頁元件 (UI.pen NEW-04)
const CourseQueryPage = {
    template: `
    <div ss-container id="section-School-timetable-Query" class="inner-section is-shown">
        <!-- Top Bar -->
        <div class="top-bar">
            <span class="top-bar-title">課程查詢</span>
            <div class="top-bar-right">
                <i data-lucide="bell" style="width:20px;height:20px;color:var(--color-text-secondary);cursor:pointer;"></i>
                <div class="user-chip" v-if="isLoggedIn">
                    <i data-lucide="user"></i>
                    <span>{{ Store.sid || '' }}</span>
                </div>
            </div>
        </div>

        <!-- Scroll Content -->
        <div class="scroll-content">
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
                    <div class="form-group w-1/2 md:w-1/4 narrow">
                        <label for="querySelectSemester" class="form-label">學期</label>
                        <select v-model="querySelectSemester" id="querySelectSemester"
                            class="form-select" :disabled="isCourseDataLoading">
                            <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
                            <option v-else value="" selected disabled>選擇學期...</option>
                            <option v-for="semester in semesterList" :key="semester.value" :value="semester.value">{{ semester.text }}</option>
                        </select>
                    </div>
                    <div class="form-group w-1/2 md:w-1/4 narrow">
                        <label for="querySelectQueryDept" class="form-label">系所</label>
                        <select v-model="querySelectQueryDept" id="querySelectQueryDept"
                            class="form-select" :disabled="isCourseDataLoading">
                            <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
                            <option v-else value="" selected disabled>選擇系所...</option>
                            <option v-for="dept_name in deptList" :key="dept_name" :value="dept_name">{{ dept_name }}</option>
                        </select>
                    </div>
                    <div class="form-group w-1/2 md:w-1/4 narrow">
                        <label for="querySelectGrade" class="form-label">開課年級</label>
                        <select v-model="querySelectGrade" id="querySelectGrade"
                            class="form-select" :disabled="isCourseDataLoading">
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
                    <div class="form-group w-1/2 md:w-1/4 narrow">
                        <label for="querySelectSemesterForName" class="form-label">學期</label>
                        <select v-model="querySelectSemesterForName" id="querySelectSemesterForName"
                            class="form-select" :disabled="isCourseDataLoading">
                            <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
                            <option v-else value="" selected disabled>選擇學期...</option>
                            <option v-for="semester in semesterList" :key="semester.value" :value="semester.value">{{ semester.text }}</option>
                        </select>
                    </div>
                    <div class="form-group w-1/2 md:w-1/2 medium">
                        <label for="queryInputQueryCourseName" class="form-label">課程關鍵字</label>
                        <input v-model="queryInputQueryCourseName" type="text" class="form-control"
                            id="queryInputQueryCourseName" placeholder="請輸入課程關鍵字" :disabled="isCourseDataLoading">
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
                    <div class="form-group w-1/2 md:w-1/4 narrow">
                        <label for="querySelectSemesterForTeacher" class="form-label">學期</label>
                        <select v-model="querySelectSemesterForTeacher" id="querySelectSemesterForTeacher"
                            class="form-select" :disabled="isCourseDataLoading">
                            <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
                            <option v-else value="" selected disabled>選擇學期...</option>
                            <option v-for="semester in semesterList" :key="semester.value" :value="semester.value">{{ semester.text }}</option>
                        </select>
                    </div>
                    <div class="form-group w-1/2 md:w-1/2 medium">
                        <label for="queryInputQueryTeacherName" class="form-label">教師姓名</label>
                        <input v-model="queryInputQueryTeacherName" type="text" class="form-control"
                            id="queryInputQueryTeacherName" placeholder="請輸入教師姓名" :disabled="isCourseDataLoading">
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
                    <div class="form-group w-1/2 md:w-1/4 narrow">
                        <label for="querySelectSemesterForTime" class="form-label">學期</label>
                        <select v-model="querySelectSemesterForTime" id="querySelectSemesterForTime"
                            class="form-select" :disabled="isCourseDataLoading">
                            <option v-if="isCourseDataLoading" value="" selected disabled>載入中...</option>
                            <option v-else value="" selected disabled>選擇學期...</option>
                            <option v-for="semester in semesterList" :key="semester.value" :value="semester.value">{{ semester.text }}</option>
                        </select>
                    </div>
                    <div class="form-group w-1/2 md:w-1/4 narrow">
                        <label for="querySelectQueryDay" class="form-label">星期</label>
                        <select v-model="querySelectQueryDay" id="querySelectQueryDay"
                            class="form-select" :disabled="isCourseDataLoading">
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
                    <div class="form-group w-1/2 md:w-1/4 narrow">
                        <label for="querySelectQueryPeriod" class="form-label">節次</label>
                        <select v-model="querySelectQueryPeriod" id="querySelectQueryPeriod"
                            class="form-select" :disabled="isCourseDataLoading">
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

            <!-- Results -->
            <div class="courses-list" v-if="queryResultForList.length > 0">
                <!-- Modal -->
                <input type="checkbox" id="MHmodal" />
                <label for="MHmodal" class="MHmodal-bg"></label>
                <div class="MHmodal-content">
                    <label for="MHmodal" class="close">
                        <i class="fa fa-times" aria-hidden="true"></i>
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
                            <tr :key="'course-list'+course.hashid" v-for="(course, index) in queryResultForList"
                                :data-hashid="course.hashid" class="accordion-toggle">
                                <td class="code-cell">{{ course.cos_id || '' }}{{ course.cos_class || '' }}</td>
                                <td class="dept-cell">{{ course.dept_grade || course.dept_name || '' }}</td>
                                <td class="point-it name-cell" :title="course.name" @click="showCourseDetail($event, course)">{{ course.name }}</td>
                                <td class="type-cell">{{ course.type || course.cos_type_name || '' }}</td>
                                <td class="time-room-cell">{{ course.time_room || '' }}</td>
                                <td class="teacher-cell" style="white-space: pre-line;">{{ course.teacher_name || course.teacher || '' }}</td>
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
        </div>
    </div>
    `,

    setup() {
        const year_now = new Date().getFullYear() - 1911;
        const smtr_now = new Date().getMonth() >= 7 ? 1 : 2;

        // ── 查詢類型 ──
        const queryType = Vue.ref('dept');

        // ── 全域查詢參數 ──
        const querySelectQueryYear = Vue.ref(`${year_now}`);
        const querySelectQuerySmt = Vue.ref(`${smtr_now}`);

        // ── 系所查詢 ──
        const querySelectSemester = Vue.ref('');
        const querySelectQueryDept = Vue.ref('');
        const querySelectGrade = Vue.ref('');
        const queryDeptKeyword = Vue.ref('');

        // ── 課程名稱查詢 ──
        const querySelectSemesterForName = Vue.ref('');
        const queryInputQueryCourseName = Vue.ref('');

        // ── 教師姓名查詢 ──
        const querySelectSemesterForTeacher = Vue.ref('');
        const queryInputQueryTeacherName = Vue.ref('');

        // ── 時間查詢 ──
        const querySelectSemesterForTime = Vue.ref('');
        const querySelectQueryDay = Vue.ref('');
        const querySelectQueryPeriod = Vue.ref('');

        // ── 從 Store 取得共享資料 ──
        const queryResultForList = Vue.computed({
            get: () => Store.queryResultForList,
            set: (v) => { Store.queryResultForList = v; }
        });
        const modalCourse = Vue.computed({
            get: () => Store.modalCourse,
            set: (v) => { Store.modalCourse = v; }
        });
        const isCourseDataLoading = Vue.computed(() => Store.isCourseDataLoading);
        const isLoggedIn = Vue.computed(() => Store.isLoggedIn);
        const deptList = Vue.computed(() => Store.deptList);
        const semesterList = Vue.computed(() => Store.semesterListForTime);

        // ── 過濾學期清單（使用 store.js 中的共用函數，M-03）──
        // filterSemesterListForTime 定義於 store.js，此處不再重複定義

        // ── 表單驗證 ──
        function validateFormFields(fields) {
            let hasError = false;
            document.querySelectorAll('.form-validation-error').forEach(el => el.classList.remove('form-validation-error'));
            document.querySelectorAll('.form-group-error').forEach(el => el.classList.remove('form-group-error'));

            fields.forEach(field => {
                const element = document.querySelector(field.selector);
                if (!element) return;
                const isEmpty = field.required && (!field.value || field.value.trim() === '');
                if (isEmpty) {
                    hasError = true;
                    element.classList.add('form-validation-error');
                    const formGroup = element.closest('.form-group');
                    if (formGroup) formGroup.classList.add('form-group-error');
                    setTimeout(() => {
                        element.classList.remove('form-validation-error');
                        if (formGroup) formGroup.classList.remove('form-group-error');
                    }, 2000);
                }
            });
            return !hasError;
        }

        // ── 課程結果映射輔助 ──
        function mapCourseResult(course, yearStr, smtrStr, deptFallback) {
            return {
                cos_id: course.cos_id,
                cos_class: course.cos_class,
                name: course.cos_name,
                cos_name: course.cos_name,
                type: course.type,
                time_room: course.time_room,
                teacher_name: course.teacher,
                dept_grade: course.dept_level || course.dept_grade || course.dept_name || deptFallback || '',
                dept_name: course.dept_level || course.dept_name || deptFallback || '',
                credits: course.credits,
                credit: 0,
                credit_loading: true,
                year: yearStr,
                smtr: smtrStr
            };
        }

        // ── 異步載入學分數 ──
        async function loadCourseCredits(courses) {
            if (!courses || courses.length === 0) return;
            const creditPromises = courses.map(async (course, index) => {
                try {
                    await new Promise(resolve => setTimeout(resolve, index * 100));
                    const credit = await window.electronAPI.backend.getCourseCredit(
                        course.year, course.smtr, course.cos_id, course.cos_class
                    );
                    course.credit = credit;
                    course.credit_loading = false;
                } catch (error) {
                    console.error(`載入課程 ${course.cos_id} 學分數失敗:`, error);
                    course.credit = 0;
                    course.credit_loading = false;
                }
            });
            await Promise.allSettled(creditPromises);
        }

        // ── 查詢函式 ──
        async function performDeptQuery() {
            const isValid = validateFormFields([
                { selector: '#querySelectSemester', value: querySelectSemester.value, required: true },
                { selector: '#querySelectQueryDept', value: querySelectQueryDept.value, required: true },
                { selector: '#querySelectGrade', value: querySelectGrade.value, required: true }
            ]);
            if (!isValid) return;

            Store.isCourseDataLoading = true;
            try {
                const result = await window.electronAPI.backend.queryCourseByDept(
                    querySelectSemester.value, querySelectQueryDept.value, querySelectGrade.value
                );
                if (result.success) {
                    let courses = result.courses;
                    if (queryDeptKeyword.value.trim()) {
                        const keyword = queryDeptKeyword.value.trim().toLowerCase();
                        courses = courses.filter(c =>
                            c.cos_name.toLowerCase().includes(keyword) || c.teacher.toLowerCase().includes(keyword)
                        );
                    }
                    const year = querySelectSemester.value.split(',')[0].trim();
                    const smtr = querySelectSemester.value.split(',')[1].trim();
                    Store.queryResultForList = courses.map(c => mapCourseResult(c, year, smtr, querySelectQueryDept.value?.trim()));
                    loadCourseCredits(Store.queryResultForList);
                } else {
                    Store.queryResultForList = [];
                }
            } catch (error) {
                console.error('系所查詢失敗:', error);
                Store.queryResultForList = [];
                if (typeof M !== 'undefined' && M.toast) M.toast({ html: '系所查詢失敗: ' + (error.message || error), displayLength: 4000 });
            } finally {
                Store.isCourseDataLoading = false;
            }
        }

        async function performNameQuery() {
            const isValid = validateFormFields([
                { selector: '#querySelectSemesterForName', value: querySelectSemesterForName.value, required: true },
                { selector: '#queryInputQueryCourseName', value: queryInputQueryCourseName.value, required: true }
            ]);
            if (!isValid) return;

            Store.isCourseDataLoading = true;
            try {
                const result = await window.electronAPI.backend.queryCourseByName(
                    querySelectSemesterForName.value, queryInputQueryCourseName.value.trim()
                );
                if (result.success) {
                    const year = querySelectSemesterForName.value.split(',')[0].trim();
                    const smtr = querySelectSemesterForName.value.split(',')[1].trim();
                    Store.queryResultForList = result.courses.map(c => mapCourseResult(c, year, smtr, ''));
                    loadCourseCredits(Store.queryResultForList);
                } else {
                    Store.queryResultForList = [];
                }
            } catch (error) {
                console.error('課程名稱查詢失敗:', error);
                Store.queryResultForList = [];
                if (typeof M !== 'undefined' && M.toast) M.toast({ html: '課程名稱查詢失敗: ' + (error.message || error), displayLength: 4000 });
            } finally {
                Store.isCourseDataLoading = false;
            }
        }

        async function performTeacherQuery() {
            const isValid = validateFormFields([
                { selector: '#querySelectSemesterForTeacher', value: querySelectSemesterForTeacher.value, required: true },
                { selector: '#queryInputQueryTeacherName', value: queryInputQueryTeacherName.value, required: true }
            ]);
            if (!isValid) return;

            Store.isCourseDataLoading = true;
            try {
                const result = await window.electronAPI.backend.queryCourseByTeacher(
                    querySelectSemesterForTeacher.value, queryInputQueryTeacherName.value.trim()
                );
                if (result.success) {
                    const year = querySelectSemesterForTeacher.value.split(',')[0].trim();
                    const smtr = querySelectSemesterForTeacher.value.split(',')[1].trim();
                    Store.queryResultForList = result.courses.map(c => mapCourseResult(c, year, smtr, ''));
                    loadCourseCredits(Store.queryResultForList);
                } else {
                    Store.queryResultForList = [];
                }
            } catch (error) {
                console.error('教師姓名查詢失敗:', error);
                Store.queryResultForList = [];
                if (typeof M !== 'undefined' && M.toast) M.toast({ html: '教師查詢失敗: ' + (error.message || error), displayLength: 4000 });
            } finally {
                Store.isCourseDataLoading = false;
            }
        }

        async function performTimeQuery() {
            const isValid = validateFormFields([
                { selector: '#querySelectSemesterForTime', value: querySelectSemesterForTime.value, required: true },
                { selector: '#querySelectQueryDay', value: querySelectQueryDay.value, required: true },
                { selector: '#querySelectQueryPeriod', value: querySelectQueryPeriod.value, required: true }
            ]);
            if (!isValid) return;

            Store.isCourseDataLoading = true;
            try {
                const ctl216 = querySelectQueryDay.value + querySelectQueryPeriod.value;
                const result = await window.electronAPI.backend.queryCourseByTime(
                    querySelectSemesterForTime.value, ctl216
                );
                if (result.success) {
                    const year = querySelectSemesterForTime.value.split(',')[0].trim();
                    const smtr = querySelectSemesterForTime.value.split(',')[1].trim();
                    Store.queryResultForList = result.courses.map(c => mapCourseResult(c, year, smtr, ''));
                    loadCourseCredits(Store.queryResultForList);
                } else {
                    Store.queryResultForList = [];
                }
            } catch (error) {
                console.error('時間查詢失敗:', error);
                Store.queryResultForList = [];
                if (typeof M !== 'undefined' && M.toast) M.toast({ html: '時間查詢失敗: ' + (error.message || error), displayLength: 4000 });
            } finally {
                Store.isCourseDataLoading = false;
            }
        }

        // ── 課程驗證與加入選課 ──
        function validateCourseData(courseData) {
            const errors = [];
            if (!courseData.cos_id || courseData.cos_id.trim() === '') errors.push('課程代碼不能為空');
            if (!courseData.name || courseData.name.trim() === '') errors.push('課程名稱不能為空');
            if (!courseData.dept_id || courseData.dept_id.trim() === '') errors.push('系所代號不能為空');
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
                    dept_id: '',
                    status: 0
                };
                const deptSelectElement = document.querySelector('#querySelectQueryDept');
                if (deptSelectElement && deptSelectElement.value) courseData.dept_id = deptSelectElement.value;

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

        function showCourseInfo(course) {
            Store.modalCourse = course;
            document.querySelector('#MHmodal').checked = true;
        }

        function showCourseDetail(event, course) {
            event.preventDefault();
            event.stopPropagation();
            window.electronAPI.openCourseDetail({
                year: querySelectQueryYear.value,
                smtr: querySelectQuerySmt.value,
                cos_id: course.cos_id,
                cos_class: course.cos_class || 'A'
            });
        }

        // ── Watcher：切換查詢類型時重置 ──
        Vue.watch(queryType, () => {
            Store.queryResultForList = [];
            querySelectSemester.value = '';
            querySelectQueryDept.value = '';
            querySelectGrade.value = '';
            queryDeptKeyword.value = '';
            querySelectSemesterForName.value = '';
            queryInputQueryCourseName.value = '';
            querySelectSemesterForTeacher.value = '';
            queryInputQueryTeacherName.value = '';
            querySelectSemesterForTime.value = '';
            querySelectQueryDay.value = '';
            querySelectQueryPeriod.value = '';

            // 重設預設學期
            if (Store.semesterListForTime.length > 0) {
                const latest = Store.semesterListForTime[0].value;
                querySelectSemester.value = latest;
                querySelectSemesterForName.value = latest;
                querySelectSemesterForTeacher.value = latest;
                querySelectSemesterForTime.value = latest;
            }
        });

        // ── 進入頁面時載入課程資料 ──
        Vue.onMounted(() => {
            if (Store.allCourseList && Store.allCourseList.length > 0) {
                Store.courseList = Store.allCourseList;
            } else if (Store.courseList.length === 0) {
                // 載入全校課程資料
                getCourseListForQuery();
            }
            // 設定預設學期
            if (Store.semesterListForTime.length > 0 && !querySelectSemester.value) {
                const latest = Store.semesterListForTime[0].value;
                querySelectSemester.value = latest;
                querySelectSemesterForName.value = latest;
                querySelectSemesterForTeacher.value = latest;
                querySelectSemesterForTime.value = latest;
            }
            Vue.nextTick(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); });
        });

        function getCourseListForQuery() {
            if (Store.isCourseListLoading) return;
            Store.isCourseListLoading = true;
            Store.isCourseDataLoading = true;

            const year = querySelectQueryYear.value || year_now;
            const semester = querySelectQuerySmt.value || '1';

            window.electronAPI.backend.getCourseList(`${year}`, `${semester}`).then((data) => {
                Store.courseList = data.course_list;
                if (data.dept_list && Array.isArray(data.dept_list)) Store.deptList = data.dept_list;
                if (data.semester_list && Array.isArray(data.semester_list)) {
                    Store.semesterListForTime = filterSemesterListForTime(data.semester_list);
                    if (Store.semesterListForTime.length > 0) {
                        const latest = Store.semesterListForTime[0].value;
                        querySelectSemester.value = latest;
                        querySelectSemesterForName.value = latest;
                        querySelectSemesterForTeacher.value = latest;
                        querySelectSemesterForTime.value = latest;
                    }
                }
                Store.isCourseListLoading = false;
                Store.isCourseDataLoading = false;
            }).catch((error) => {
                Store.isCourseListLoading = false;
                Store.isCourseDataLoading = false;
                console.error('課程資料載入失敗:', error);
            });
        }

        return {
            queryType, Store,
            querySelectSemester, querySelectQueryDept, querySelectGrade, queryDeptKeyword,
            querySelectSemesterForName, queryInputQueryCourseName,
            querySelectSemesterForTeacher, queryInputQueryTeacherName,
            querySelectSemesterForTime, querySelectQueryDay, querySelectQueryPeriod,
            queryResultForList, modalCourse, isCourseDataLoading, isLoggedIn,
            deptList, semesterList,
            performDeptQuery, performNameQuery, performTeacherQuery, performTimeQuery,
            addToSchedule, showCourseInfo, showCourseDetail
        };
    }
};
