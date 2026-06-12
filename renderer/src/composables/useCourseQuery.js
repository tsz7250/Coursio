import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Store, year_now, filterSemesterListForTime } from '../store.js';
import { useLogout } from './useLogout.js';
import { requestQueue } from '../utils/requestQueue.js';



export function useCourseQuery() {
    // ── 查詢類型 ──
    const queryType = ref('dept');

    // ── 全域查詢參數 ──
    const querySelectQueryYear = ref(`${year_now}`);
    const querySelectQuerySmt = ref(`${new Date().getMonth() >= 7 ? 1 : 2}`);

    // ── 系所查詢 ──
    const querySelectSemester = ref('');
    const querySelectQueryDept = ref('');
    const querySelectGrade = ref('');
    const queryDeptKeyword = ref('');

    // ── 課程名稱查詢 ──
    const querySelectSemesterForName = ref('');
    const queryInputQueryCourseName = ref('');

    // ── 教師姓名查詢 ──
    const querySelectSemesterForTeacher = ref('');
    const queryInputQueryTeacherName = ref('');

    // ── 時間查詢 ──
    const querySelectSemesterForTime = ref('');
    const querySelectQueryDay = ref('');
    const querySelectQueryPeriod = ref('');

    // ── 從 Store 取得共享資料 ──
    const queryResultForList = computed({
        get: () => Store.queryResultForList,
        set: (v) => { Store.queryResultForList = v; }
    });
    const isCourseDataLoading = computed(() => Store.isCourseDataLoading);
    const isLoggedIn = computed(() => Store.isLoggedIn);
    const deptList = computed(() => Store.deptList);
    const semesterList = computed(() => Store.semesterListForTime);

    // ── 分頁 ──
    const currentPage = ref(1);
    const pageSize = ref(20);

    const totalPages = computed(() => Math.ceil((queryResultForList.value?.length || 0) / pageSize.value));
    const paginatedCourses = computed(() => {
        const all = queryResultForList.value || [];
        const start = (currentPage.value - 1) * pageSize.value;
        return all.slice(start, start + pageSize.value);
    });

    function resetPage() { currentPage.value = 1; }

    watch(pageSize, (newSize, oldSize) => {
        if (oldSize && newSize > oldSize) {
            const firstItemIndex = (currentPage.value - 1) * oldSize;
            currentPage.value = Math.floor(firstItemIndex / newSize) + 1;
        } else {
            resetPage();
        }
    });

    // 監聽當前分頁以按需載入學分數
    watch(paginatedCourses, (newVal) => {
        if (newVal && newVal.length > 0) {
            const toLoad = newVal.filter(c => c.credit_loading && c.credit === 0 && !c.credit_fetching);
            if (toLoad.length > 0) {
                loadCourseCredits(toLoad);
            }
        }
    }, { immediate: true, deep: true });

    const router = useRouter();
    function goToSettings() { router.push({ name: 'Settings' }); Store.showUserMenu = false; }
    const { logout } = useLogout();

    // ── 表單驗證狀態 ──
    const formErrors = ref({});

    function validateFormFields(fields) {
        let hasError = false;
        formErrors.value = {};
        fields.forEach(field => {
            const isEmpty = field.required && (!field.value || field.value.trim() === '');
            if (isEmpty) {
                hasError = true;
                formErrors.value[field.id] = true;
                setTimeout(() => {
                    if (formErrors.value[field.id]) formErrors.value[field.id] = false;
                }, 2000);
            }
        });
        return !hasError;
    }

    // ── 課程結果映射輔助 ──
    function mapCourseResult(course, yearStr, smtrStr, deptFallback, isFromTimeQuery = false) {
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
            dept_id: deptFallback || '',
            credits: course.credits,
            credit: 0,
            credit_loading: true,
            credit_fetching: false,
            year: yearStr,
            smtr: smtrStr,
            isFromTimeQuery,
            reg_num: course.reg_num,
            max_num: course.max_num
        };
    }

    // ── 異步載入學分數（使用優先佇列，保護服務端流量）──
    function loadCourseCredits(courses) {
        if (!courses || courses.length === 0) return;
        courses.forEach(async (course) => {
            if (course.credit_fetching) return;
            course.credit_fetching = true;
            try {
                const credit = await requestQueue.enqueue(
                    () => window.electronAPI.backend.getCourseCredit(
                        course.year, course.smtr, course.cos_id, course.cos_class
                    ),
                    'low'
                );
                course.credit = credit;
                course.credit_loading = false;
            } catch (error) {
                if (error && error.message === 'Queue cleared') {
                    return;
                }
                console.error(`載入課程 ${course.cos_id} 學分數失敗:`, error);
                course.credit = 0;
                course.credit_loading = false;
            } finally {
                course.credit_fetching = false;
            }
        });
    }

    // ── 統一查詢執行函式，消除 4 個 performXxxQuery 的重複樣板 ──
    async function _executeQuery({ fields, apiCallFn, semesterRef, deptStr = '', errorLabel, postFilter, isFromTimeQuery = false }) {
        if (!validateFormFields(fields)) return;
        Store.isCourseDataLoading = true;
        requestQueue.clearLowQueue();
        try {
            const result = await requestQueue.enqueue(apiCallFn, 'high');
            if (result.success) {
                const [year, smtr] = semesterRef.value.split(',').map(s => s.trim());
                let courses = result.courses;
                if (postFilter) courses = postFilter(courses);
                Store.queryResultForList = courses.map(c => mapCourseResult(c, year, smtr, deptStr, isFromTimeQuery));
                resetPage();
            } else {
                Store.queryResultForList = [];
            }
        } catch (error) {
            console.error(`${errorLabel}失敗:`, error);
            Store.queryResultForList = [];
            if (typeof M !== 'undefined' && M.toast)
                M.toast({ html: `${errorLabel}失敗: ` + (error.message || error), displayLength: 4000 });
        } finally {
            Store.isCourseDataLoading = false;
        }
    }

    async function performDeptQuery() {
        await _executeQuery({
            fields: [
                { id: 'querySelectSemester', value: querySelectSemester.value, required: true },
                { id: 'querySelectQueryDept', value: querySelectQueryDept.value, required: true },
                { id: 'querySelectGrade', value: querySelectGrade.value, required: true }
            ],
            apiCallFn: () => window.electronAPI.backend.queryCourseByDept(
                querySelectSemester.value, querySelectQueryDept.value, querySelectGrade.value
            ),
            semesterRef: querySelectSemester,
            deptStr: querySelectQueryDept.value?.trim(),
            errorLabel: '系所查詢',
            postFilter: queryDeptKeyword.value.trim() ? (courses) => {
                const kw = queryDeptKeyword.value.trim().toLowerCase();
                return courses.filter(c =>
                    c.cos_name.toLowerCase().includes(kw) || c.teacher.toLowerCase().includes(kw)
                );
            } : null
        });
    }

    async function performNameQuery() {
        await _executeQuery({
            fields: [
                { id: 'querySelectSemesterForName', value: querySelectSemesterForName.value, required: true },
                { id: 'queryInputQueryCourseName', value: queryInputQueryCourseName.value, required: true }
            ],
            apiCallFn: () => window.electronAPI.backend.queryCourseByName(
                querySelectSemesterForName.value, queryInputQueryCourseName.value.trim()
            ),
            semesterRef: querySelectSemesterForName,
            errorLabel: '課程名稱查詢'
        });
    }

    async function performTeacherQuery() {
        await _executeQuery({
            fields: [
                { id: 'querySelectSemesterForTeacher', value: querySelectSemesterForTeacher.value, required: true },
                { id: 'queryInputQueryTeacherName', value: queryInputQueryTeacherName.value, required: true }
            ],
            apiCallFn: () => window.electronAPI.backend.queryCourseByTeacher(
                querySelectSemesterForTeacher.value, queryInputQueryTeacherName.value.trim()
            ),
            semesterRef: querySelectSemesterForTeacher,
            errorLabel: '教師查詢'
        });
    }

    async function performTimeQuery() {
        await _executeQuery({
            fields: [
                { id: 'querySelectSemesterForTime', value: querySelectSemesterForTime.value, required: true },
                { id: 'querySelectQueryDay', value: querySelectQueryDay.value, required: true },
                { id: 'querySelectQueryPeriod', value: querySelectQueryPeriod.value, required: true }
            ],
            apiCallFn: () => window.electronAPI.backend.queryCourseByTime(
                querySelectSemesterForTime.value,
                querySelectQueryDay.value + querySelectQueryPeriod.value
            ),
            semesterRef: querySelectSemesterForTime,
            errorLabel: '時間查詢',
            isFromTimeQuery: true
        });
    }

    function handleShowDetail(detail) {
        window.electronAPI.openCourseDetail(detail);
    }

    // ── Watcher：切換查詢類型時重置所有欄位 ──
    watch(queryType, () => {
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

        if (Store.semesterListForTime.length > 0) {
            const latest = Store.semesterListForTime[0].value;
            querySelectSemester.value = latest;
            querySelectSemesterForName.value = latest;
            querySelectSemesterForTeacher.value = latest;
            querySelectSemesterForTime.value = latest;
        }
    });

    // ── 課程清單初始化 ──
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
        // State
        queryType,
        querySelectQueryYear,
        querySelectQuerySmt,
        querySelectSemester,
        querySelectQueryDept,
        querySelectGrade,
        queryDeptKeyword,
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
        // Actions
        goToSettings,
        logout,
        performDeptQuery,
        performNameQuery,
        performTeacherQuery,
        performTimeQuery,
        handleShowDetail,
        getCourseListForQuery,
    };
}
