const { ipcRenderer } = require("electron");
// BackendService 已在 HTML 中載入
const { ref, onMounted, onUpdated, computed, watch } = Vue;

// 避免重複宣告 fs，直接使用 Node.js 的 require
const electron_fs = require('fs');
var settingFilePath = "settings.json"

// 安全地載入設定檔
let settings;
try {
    settings = JSON.parse(electron_fs.readFileSync(settingFilePath))
} catch (error) {
    console.log("設定檔載入失敗，使用預設值");
    settings = {"interval": 2, "stage": "1"};
}

var apibackend = new BackendService()

// 讓 apibackend 全域可用
window.apibackend = apibackend;

var sqlite3 = require('sqlite3').verbose();
const database = new sqlite3.Database('db.sqlite');

// 初始化資料庫表格
database.serialize(() => {
    database.run(`CREATE TABLE IF NOT EXISTS tasks (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT, 
        "year" TEXT,
        "smtr" TEXT,
        "stage" TEXT,
        "cos_id" TEXT,
        "cos_class" TEXT,
        "cos_type_name" TEXT,
        "credit" INTEGER,
        "room" TEXT,
        "name" TEXT,
        "teacher_name" TEXT,
        "dept_name" TEXT,
        "status" INTEGER
    )`, (err) => {
        if (err) {
            console.error('建立 tasks 表格失敗:', err.message);
        } else {
            console.log('✅ Tasks 資料庫表格已準備就緒');
        }
    });
});



var year_now = new Date().getFullYear() - 1911;
var smtr_now = new Date().getMonth() >= 7 ? 1 : 2;

function saveSettingFile(){
	electron_fs.writeFileSync(settingFilePath, JSON.stringify(settings))
}

const app = Vue.createApp({
	el: '#app',
	//   delimiters: ['@{', '}'],
	setup() {
		/**
		 * Variables
		 */
		const sid = ref("");
		const spwd = ref("");

		const greetings = ref("")
		const isLoggedIn = ref(false);  // 追蹤登入狀態

		const isLoading = ref(false);  // 是否
		const loading_text = ref("");

		const semester_list_for_time = ref([]); // 時間查詢用的學期清單，從 API 動態載入
		const dept_list = ref([]); // 系所清單，從 API 動態載入

		// 表單驗證函數
		function validateFormFields(fields) {
			let hasError = false;
			
			// 清除之前的錯誤樣式
			document.querySelectorAll('.form-validation-error').forEach(el => {
				el.classList.remove('form-validation-error');
			});
			document.querySelectorAll('.form-group-error').forEach(el => {
				el.classList.remove('form-group-error');
			});
			
			// 檢查每個欄位
			fields.forEach(field => {
				const element = document.querySelector(field.selector);
				if (!element) return;
				
				const isEmpty = field.required && (!field.value || field.value.trim() === '');
				
				if (isEmpty) {
					hasError = true;
					element.classList.add('form-validation-error');
					
					// 為表單群組添加錯誤提示
					const formGroup = element.closest('.form-group');
					if (formGroup) {
						formGroup.classList.add('form-group-error');
					}
					
					// 2秒後移除錯誤樣式
					setTimeout(() => {
						element.classList.remove('form-validation-error');
						if (formGroup) {
							formGroup.classList.remove('form-group-error');
						}
					}, 2000);
				}
			});
			
			return !hasError;
		}

		// 過濾學期清單，只保留5年且只包含XXX1和XXX2格式
		function filterSemesterListForTime(semesterList) {
			if (!Array.isArray(semesterList)) return [];
			
			// 取得當前學年（動態計算）
			const currentYear = year_now;
			const minYear = currentYear - 4; // 保留5年，包括現在
			
			return semesterList.filter(semester => {
				// 檢查格式是否為 XXX1 或 XXX2
				const value = semester.value;
				if (!value || typeof value !== 'string') return false;
				
				// 提取學年數字
				const yearMatch = value.match(/^(\d+),/);
				if (!yearMatch) return false;
				
				const year = parseInt(yearMatch[1]);
				const semesterNum = value.split(',')[1]?.trim();
				
				// 只保留XXX1和XXX2格式，且在5年範圍內
				return (semesterNum === '1' || semesterNum === '2') && 
					   year >= minYear && year <= currentYear;
			}).sort((a, b) => {
				// 按學年降序排列（最新的在前）
				const yearA = parseInt(a.value.split(',')[0]);
				const yearB = parseInt(b.value.split(',')[0]);
				const semesterA = parseInt(a.value.split(',')[1]);
				const semesterB = parseInt(b.value.split(',')[1]);
				
				if (yearA !== yearB) return yearB - yearA;
				return semesterB - semesterA;
			});
		}







		// School Timetable Query - New unified approach
		const queryType = ref("dept")  // 欲搜尋的類型

		// 全域查詢用學年與學期（供後端 API 使用）
		const querySelectQueryYear = ref(`${year_now}`)
		const querySelectQuerySmt = ref(`${smtr_now}`)
		
		// 系所查詢相關變數
		const querySelectSemester = ref("")  // 學期 (DDL_YM 格式)
		const querySelectQueryDept = ref("")  // 系所
		const querySelectGrade = ref("")  // 年級 (DDL_Degree)
		const queryDeptKeyword = ref("")  // 關鍵字篩選

		// 課程名稱查詢相關變數  
		const querySelectSemesterForName = ref("")  // 學期
		const querySelectDeptForName = ref("")  // 系所
		const querySelectGradeForName = ref("")  // 年級  
		const queryInputQueryCourseName = ref("")  // 課程名稱

		// 教師姓名查詢相關變數
		const querySelectSemesterForTeacher = ref("")  // 學期
		const queryInputQueryTeacherName = ref("")  // 教師名稱

		// 時間查詢相關變數
		const querySelectSemesterForTime = ref("")  // 學期
		const querySelectDeptForTime = ref("")  // 系所
		const querySelectGradeForTime = ref("")  // 年級
		const querySelectQueryDay = ref("")   // 欲搜尋的星期
		const querySelectQueryPeriod = ref("")  // 欲搜尋的課堂時間

		const queryResultForList = ref([]) // 用於儲存已查詢到的課程列表
		const modalCourse = ref({}) // 用於儲存點擊的 Course Info 並顯示於 Modal 中
		var CourseList = []; // 總課程列表（保留作為後備）
		var isCourseListLoading = false; // 追蹤課程資料載入狀態
		const isCourseDataLoading = ref(false); // 用於UI顯示的載入狀態

		// Task List
		const tasks = ref([]);

		// Settings
		const StealCourseInterval = ref(settings.interval); // 選課時間間隔
		const StealCourseStage = ref(settings.stage); // 選課階段

		/**
		 * Functions
		 */
		// 登入並取得學生名字
		function login() {
			if (sid.value !== "" && spwd.value !== "") {
				loading_text.value = "登入中";
				isLoading.value = true;

				apibackend._getRSAKey()
					.then((service) => {
						return service._encryptData(sid.value, spwd.value)
					})
					.then((service) => {
						isLoggedIn.value = true;  // 設置登入狀態
						
						// 載入必要的課程資料
						loading_text.value = "載入課程資料中...";
						
						// 載入個人課表和全校課程資料
						Promise.allSettled([
							getCourseListAsync(),
							getCourseListForQuery({ showLoading: false, returnPromise: true, storeInWindow: true }),
						]).then((results) => {
							// 載入完成後切換到主畫面
							isLoading.value = false;
							loading_text.value = "";
							document.querySelector(".login-panel").classList.add("slide-up")

							setTimeout(() => {
								document.querySelector(".login-panel").style.display = "none";
								document.querySelector(".login-panel").classList.remove("slide-up")
								document.querySelector(".content-panel").style.display = "flex";
								
								// 顯示首頁
								showSectionById("Main")
								setTimeout(() => updateMainHeader(), 50);
							}, 800);
						}).catch((error) => {
							console.error("載入課程資料時發生錯誤:", error);
							// 即使載入失敗也要切換到主畫面
							isLoading.value = false;
							loading_text.value = "";
							document.querySelector(".login-panel").classList.add("slide-up")

							setTimeout(() => {
								document.querySelector(".login-panel").style.display = "none";
								document.querySelector(".login-panel").classList.remove("slide-up")
								document.querySelector(".content-panel").style.display = "flex";
								
								// 顯示首頁
								showSectionById("Main")
							}, 800);
						});
					}).catch((error) => {
						// 確保登入失敗時清除載入狀態
						console.error("登入失敗:", error);
						isLoading.value = false;
						loading_text.value = "登入失敗，請檢查帳號密碼";
						
						// 2秒後清除錯誤訊息
						setTimeout(() => {
							loading_text.value = "";
						}, 2000);
					})
			} else {
				alert("請輸入學號和密碼");
			}
		}

		// 訪客瀏覽功能
		function browseAsGuest() {
			isLoggedIn.value = false;  // 確保訪客狀態
			
			
			// 立即開始滑動動畫，不顯示載入狀態
			document.querySelector(".login-panel").classList.add("slide-up")

			// 根據動畫時間調整延遲（slide-up 動畫是 0.8s）
			setTimeout(() => {
				document.querySelector(".login-panel").style.display = "none";
				document.querySelector(".login-panel").classList.remove("slide-up")
				document.querySelector(".content-panel").style.display = "flex";
				
				// 直接顯示課程查詢頁面
				showSectionById("School-timetable-Query")
			}, 800); // 0.8 秒，配合動畫時間

			// 檢查課程資料是否已載入，如果沒有才重新載入
			if (CourseList.length === 0 && !isCourseListLoading) {
				getCourseListSilent();
			}
			
			// 訪客模式也需要預先載入全校課程資料用於查詢
			if (!window.allCourseList || window.allCourseList.length === 0) {
				getCourseListForQuery({ showLoading: false, returnPromise: true, storeInWindow: true });
			}
		}

		// 靜默載入課程資料（不顯示載入動畫）
		function getCourseListSilent() {
			// 如果正在載入或已經載入完成，則不重複載入
			if (isCourseListLoading || CourseList.length > 0) {
				return;
			}
			
			isCourseListLoading = true;
			isCourseDataLoading.value = true; // 設置UI載入狀態
			
			apibackend.getCourseListFromYZUApi(`${querySelectQueryYear.value}`, `${querySelectQuerySmt.value}`).then((data) => {
				CourseList = data.course_list;
				// 更新系所清單
				if (data.dept_list && Array.isArray(data.dept_list)) {
					dept_list.value = data.dept_list;
				}
				// 更新學期清單（時間查詢用）
				if (data.semester_list && Array.isArray(data.semester_list)) {
					semester_list_for_time.value = filterSemesterListForTime(data.semester_list);
					// 設定所有學期選擇器的預設值為最新的學期
					if (semester_list_for_time.value.length > 0) {
						const latestSemester = semester_list_for_time.value[0].value;
						querySelectSemester.value = latestSemester;
						querySelectSemesterForName.value = latestSemester;
						querySelectSemesterForTeacher.value = latestSemester;
						querySelectSemesterForTime.value = latestSemester;
					}
				}
				isCourseListLoading = false;
				isCourseDataLoading.value = false; // 清除UI載入狀態
			}).catch((error) => {
				isCourseListLoading = false;
				isCourseDataLoading.value = false; // 清除UI載入狀態
				console.error("課程資料下載失敗:", error);
			})
		}

		// 檢查是否為個人課表資料
		function isPersonalScheduleData() {
			// 如果 CourseList 中的課程數量很少（通常個人課表不會超過20門課），
			// 且課程來源標記為個人課表，則判斷為個人課表資料
			if (CourseList.length > 0 && CourseList.length < 20) {
				// 檢查是否有個人課表的特徵
				const hasPersonalFeatures = CourseList.some(course => 
					course.source === "personal" || 
					course.is_personal === true ||
					(course.time && course.time.includes("第") && course.time.includes("節"))
				);
				return hasPersonalFeatures;
			}
			return false;
		}

		// 為課程查詢載入全校課程資料（統一版本）
		function getCourseListForQuery(options = {}) {
			const {
				showLoading = true,        // 是否顯示載入狀態
				returnPromise = false,     // 是否返回 Promise
				storeInWindow = false      // 是否存到 window.allCourseList
			} = options;
			
			// 載入狀態檢查（僅在顯示載入時）
			if (showLoading && isCourseListLoading) {
				return returnPromise ? Promise.resolve() : undefined;
			}
			
			if (showLoading) {
				isCourseListLoading = true;
				isCourseDataLoading.value = true;
			}
			
			// 確保年份和學期有預設值
			const year = querySelectQueryYear.value || new Date().getFullYear() - 1911;
			const semester = querySelectQuerySmt.value || "1";
			
			const logPrefix = storeInWindow ? "（登入流程）" : "";
			
			const promise = apibackend.getCourseListFromYZUApi(`${year}`, `${semester}`).then((data) => {
				// 根據選項決定存儲位置
				if (storeInWindow) {
					window.allCourseList = data.course_list;
				} else {
					CourseList = data.course_list;
				}
				
				// 更新系所清單
				if (data.dept_list && Array.isArray(data.dept_list)) {
					dept_list.value = data.dept_list;
				}
				
				// 更新學期清單（時間查詢用）
				if (data.semester_list && Array.isArray(data.semester_list)) {
					semester_list_for_time.value = filterSemesterListForTime(data.semester_list);
					// 設定所有學期選擇器的預設值為最新的學期
					if (semester_list_for_time.value.length > 0) {
						const latestSemester = semester_list_for_time.value[0].value;
						querySelectSemester.value = latestSemester;
						querySelectSemesterForName.value = latestSemester;
						querySelectSemesterForTeacher.value = latestSemester;
						querySelectSemesterForTime.value = latestSemester;
					}
				}
				
				if (showLoading) {
					isCourseListLoading = false;
					isCourseDataLoading.value = false;
				}
				
				return Promise.resolve();
			}).catch((error) => {
				if (showLoading) {
					isCourseListLoading = false;
					isCourseDataLoading.value = false;
				}
				
				if (storeInWindow) {
					console.error(`全校課程資料載入失敗${logPrefix}:`, error);
					window.allCourseList = []; // 設置為空陣列，避免後續錯誤
					return Promise.resolve(); // 不中斷登入流程
				} else {
					console.error(`全校課程資料載入失敗${logPrefix}:`, error);
					throw error;
				}
			});
			
			return returnPromise ? promise : undefined;
		}


		// 返回登入頁面
		function returnToLogin() {
			// 重置狀態（保留輸入框內容以支援 Autofill）
			isLoggedIn.value = false;
			// 不清空 sid.value 和 spwd.value，讓 Autofill 可以保存
			
			// 顯示登入面板
			document.querySelector(".login-panel").style.display = "flex";
			document.querySelector(".content-panel").style.display = "none";
		}

		function showSection(id) {
			// 放寬：訪客可切換到所有區段
			showSectionById(id)
			
			// 當切換到首頁時，更新問候語（顯示學號或訪客）
			if (id === 'Main') {
				setTimeout(() => updateMainHeader(), 50);
			}

			// 當切換到課表頁面時，自動載入課表資料
			if (id === 'Schedule') {
				// 使用 setTimeout 確保頁面完全顯示後再載入課表
				setTimeout(() => {
					// 如果已經有課表資料，直接生成課表；否則重新載入
					if (window.apibackend && window.apibackend.course_schedule_data && 
						window.apibackend.course_schedule_data.course_list && 
						window.apibackend.course_schedule_data.course_list.length > 0) {
						window.generateScheduleTable();
					} else {
						window.refreshSchedule();
					}
				}, 100);
			}
			
			// 當切換到課程查詢頁面時，檢查並載入全校課程資料
			if (id === 'School-timetable-Query') {
				// 使用 setTimeout 確保頁面完全顯示後再檢查課程資料
				setTimeout(() => {
					// 優先使用預先載入的全校課程資料
					if (window.allCourseList && window.allCourseList.length > 0) {
						CourseList = window.allCourseList;
					} else if (CourseList.length === 0 || isPersonalScheduleData()) {
						getCourseListForQuery();
					}
				}, 100);
			}
		}





		// 異步版本的 getCourseSchedule，用於登入流程中取得個人課表
		function getCourseListAsync() {
			// 確保年份和學期有預設值
			const year = querySelectQueryYear.value || new Date().getFullYear() - 1911;
			const semester = querySelectQuerySmt.value || "1";
			
			return apibackend.getCourseSchedule(`${year}`, `${semester}`).then((service) => {
				// 使用個人課表資料
				if (service.course_schedule_data && service.course_schedule_data.course_list) {
					CourseList = service.course_schedule_data.course_list;
				} else {
					CourseList = [];
				}
				
				return Promise.resolve();
			}).catch((error) => {
				console.error("個人課表載入失敗:", error);
				CourseList = [];
				return Promise.resolve(); // 不中斷載入流程，繼續進行
			});
		}

		// 新的查詢功能 - 使用 portalfun.yzu.edu.tw 方法
		async function performDeptQuery() {
			// 驗證表單欄位
			const isValid = validateFormFields([
				{ selector: '#querySelectSemester', value: querySelectSemester.value, required: true },
				{ selector: '#querySelectQueryDept', value: querySelectQueryDept.value, required: true },
				{ selector: '#querySelectGrade', value: querySelectGrade.value, required: true }
			]);
			
			if (!isValid) {
				return;
			}

			isCourseDataLoading.value = true;
			
			try {
				
				const result = await apibackend.queryCourseByDept(
					querySelectSemester.value,
					querySelectQueryDept.value,
					querySelectGrade.value
				);
				
				if (result.success) {
					let courses = result.courses;
					
					// 如果有關鍵字篩選，進行後處理過濾
					if (queryDeptKeyword.value.trim()) {
						const keyword = queryDeptKeyword.value.trim().toLowerCase();
						courses = courses.filter(course => 
							course.cos_name.toLowerCase().includes(keyword) ||
							course.teacher.toLowerCase().includes(keyword)
						);
					}
					
					// 轉換格式以符合現有顯示邏輯
					queryResultForList.value = courses.map(course => ({
						cos_id: course.cos_id,
						cos_class: course.cos_class,
						name: course.cos_name,
						cos_name: course.cos_name,
						type: course.type,
						time_room: course.time_room,
						teacher_name: course.teacher,
						dept_grade: course.dept_level || course.dept_grade || course.dept_name || querySelectQueryDept.value?.trim(),
						dept_name: course.dept_level || course.dept_name || querySelectQueryDept.value?.trim(),
						credits: course.credits,
						year: querySelectSemester.value.split(',')[0].trim(),
						smtr: querySelectSemester.value.split(',')[1].trim()
					}));
					
				} else {
					queryResultForList.value = [];
				}
			} catch (error) {
				console.error("系所查詢失敗:", error);
				queryResultForList.value = [];
			} finally {
				isCourseDataLoading.value = false;
			}
		}

		async function performNameQuery() {
			// 驗證表單欄位
			const isValid = validateFormFields([
				{ selector: '#queryInputQueryCourseName', value: queryInputQueryCourseName.value, required: true }
			]);
			
			if (!isValid) {
				return;
			}
			isCourseDataLoading.value = true;
			try {
				const ddlYM = `${querySelectQueryYear.value || year_now},${querySelectQuerySmt.value || smtr_now}  `;
				const result = await apibackend.queryCourseByName(
					ddlYM,
					queryInputQueryCourseName.value.trim()
				);
				if (result.success) {
					queryResultForList.value = result.courses.map(course => ({
						cos_id: course.cos_id,
						cos_class: course.cos_class,
						name: course.cos_name,
						cos_name: course.cos_name,
						type: course.type,
						time_room: course.time_room,
						teacher_name: course.teacher,
						dept_grade: course.dept_level || course.dept_grade || course.dept_name || '',
						dept_name: course.dept_level || course.dept_name || '',
						credits: course.credits,
						year: ddlYM.split(',')[0].trim(),
						smtr: ddlYM.split(',')[1].trim()
					}));
				} else {
					queryResultForList.value = [];
				}
			} catch (error) {
				console.error("課程名稱查詢失敗:", error);
				queryResultForList.value = [];
			} finally {
				isCourseDataLoading.value = false;
			}
		}

		async function performTeacherQuery() {
			// 驗證表單欄位
			const isValid = validateFormFields([
				{ selector: '#querySelectSemesterForTeacher', value: querySelectSemesterForTeacher.value, required: true },
				{ selector: '#queryInputQueryTeacherName', value: queryInputQueryTeacherName.value, required: true }
			]);
			
			if (!isValid) {
				return;
			}

			isCourseDataLoading.value = true;
			
			try {
				
				const result = await apibackend.queryCourseByTeacher(
					querySelectSemesterForTeacher.value,
					queryInputQueryTeacherName.value.trim()
				);
				
				if (result.success) {
					queryResultForList.value = result.courses.map(course => ({
						cos_id: course.cos_id,
						cos_class: course.cos_class,
						name: course.cos_name,
						cos_name: course.cos_name,
						type: course.type,
						time_room: course.time_room,
						teacher_name: course.teacher,
						dept_grade: course.dept_level || course.dept_grade || course.dept_name || '',
						dept_name: course.dept_level || course.dept_name || '',
						credits: course.credits,
						year: querySelectSemesterForTeacher.value.split(',')[0].trim(),
						smtr: querySelectSemesterForTeacher.value.split(',')[1].trim()
					}));
					
				} else {
					queryResultForList.value = [];
				}
			} catch (error) {
				console.error("教師姓名查詢失敗:", error);
				queryResultForList.value = [];
			} finally {
				isCourseDataLoading.value = false;
			}
		}

		async function performTimeQuery() {
			// 驗證表單欄位
			const isValid = validateFormFields([
				{ selector: '#querySelectSemesterForTime', value: querySelectSemesterForTime.value, required: true },
				{ selector: '#querySelectQueryDay', value: querySelectQueryDay.value, required: true },
				{ selector: '#querySelectQueryPeriod', value: querySelectQueryPeriod.value, required: true }
			]);
			
			if (!isValid) {
				return;
			}
			isCourseDataLoading.value = true;
			try {
				const ctl216 = querySelectQueryDay.value + querySelectQueryPeriod.value;
				const result = await apibackend.queryCourseByTime(
					querySelectSemesterForTime.value,
					ctl216
				);
				if (result.success) {
					queryResultForList.value = result.courses.map(course => ({
						cos_id: course.cos_id,
						cos_class: course.cos_class,
						name: course.cos_name,
						cos_name: course.cos_name,
						type: course.type,
						time_room: course.time_room,
						teacher_name: course.teacher,
						dept_grade: course.dept_level || course.dept_grade || course.dept_name || '',
						dept_name: course.dept_level || course.dept_name || '',
						credits: course.credits,
						year: querySelectSemesterForTime.value.split(',')[0].trim(),
						smtr: querySelectSemesterForTime.value.split(',')[1].trim()
					}));
				} else {
					queryResultForList.value = [];
				}
			} catch (error) {
				console.error("時間查詢失敗:", error);
				queryResultForList.value = [];
			} finally {
				isCourseDataLoading.value = false;
			}
		}

		// 停用自動監聽查詢，改為按鈕觸發

		watch(queryType, (newQueryType) => {
			// 切換查詢類型時清空結果
			queryResultForList.value = [];
			
			// 清空所有查詢參數
			querySelectSemester.value = "";
			querySelectQueryDept.value = "";
			querySelectGrade.value = "";
			queryDeptKeyword.value = "";
			
			querySelectSemesterForName.value = "";
			querySelectDeptForName.value = "";
			querySelectGradeForName.value = "";
			queryInputQueryCourseName.value = "";
			
			querySelectSemesterForTeacher.value = "";
			queryInputQueryTeacherName.value = "";
			
			querySelectSemesterForTime.value = "";
			querySelectDeptForTime.value = "";
			querySelectGradeForTime.value = "";
			querySelectQueryDay.value = "";
			querySelectQueryPeriod.value = "";
			
			// 重新設定所有學期選擇器的預設值為最新的學期
			if (semester_list_for_time.value.length > 0) {
				const latestSemester = semester_list_for_time.value[0].value;
				querySelectSemester.value = latestSemester;
				querySelectSemesterForName.value = latestSemester;
				querySelectSemesterForTeacher.value = latestSemester;
				querySelectSemesterForTime.value = latestSemester;
			}
		});

		watch(StealCourseInterval, (newInterval, prevInterval) => {
			settings["interval"] = parseInt(newInterval)
			saveSettingFile()
		})

		watch(StealCourseStage, (newStage, prevStage) => {
			settings["stage"] = newStage
			saveSettingFile()
		})

		function addToSchedule(event, course) {
			event.preventDefault()
			event.stopPropagation()
			
			// 直接添加課程到選課任務列表資料庫
			const courseData = {
				year: querySelectQueryYear.value,
				smtr: querySelectQuerySmt.value,
				stage: "1",
				cos_id: course.cos_id || '',
				cos_class: course.cos_class || 'A',
				cos_type_name: course.cos_type_name || '',
				credit: course.credit || 0,
				room: course.room || '',
				name: course.name || '',
				teacher_name: course.teacher_name || '',
				dept_name: course.dept_name || '',
				status: 0 // 0 = 尚未選到
			};
			
			// 檢查是否已存在相同課程
			database.get(
				`SELECT * FROM tasks WHERE cos_id = ? AND cos_class = ? AND year = ? AND smtr = ?`, 
				[courseData.cos_id, courseData.cos_class, courseData.year, courseData.smtr],
				(err, row) => {
					if (err) {
						console.error('檢查課程失敗:', err.message);
						alert('❌ 加入選課清單失敗: ' + err.message);
						return;
					}
					
					if (row) {
						alert(`⚠️ 課程 ${courseData.cos_id}${courseData.cos_class} 已存在於選課清單中`);
						return;
					}
					
					// 插入新的選課任務
					database.run(
						`INSERT INTO tasks(year, smtr, stage, cos_id, cos_class, cos_type_name, credit, room, name, teacher_name, dept_name, status)
						 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						[courseData.year, courseData.smtr, courseData.stage, courseData.cos_id, courseData.cos_class, 
						 courseData.cos_type_name, courseData.credit, courseData.room, courseData.name, 
						 courseData.teacher_name, courseData.dept_name, courseData.status],
						function (err) {
							if (err) {
								console.error('新增課程失敗:', err.message);
								alert('❌ 加入選課清單失敗: ' + err.message);
							} else {
								alert(`✅ 課程 ${courseData.cos_id}${courseData.cos_class} - ${courseData.name} 已加入選課清單！\n\n請前往「選課任務列表」查看，或使用「自動選課」功能。`);
							}
						}
					);
				}
			);
		}

		function normalizeText(str) {
			return String(str || "")
				.replace(/\u00A0/g, ' ')
				.replace(/\u3000/g, ' ')
				.replace(/\s+/g, ' ')
				.trim();
		}

		function showCourseInfo(course) {
			modalCourse.value = course;
			document.querySelector("#MHmodal").checked = true;
		}

		// 更新首頁標題的學號/訪客顯示
		function updateMainHeader() {
			try {
				const headerEl = document.querySelector('#section-Main > div.header > h4');
				if (!headerEl) return;
				const studentId = String(sid.value || '').trim();
				const nameText = isLoggedIn.value && studentId ? studentId : '訪客';
				const suffix = '，今天想要來點什麼學分？';
				// 組裝文字（避免重複疊加）
				headerEl.textContent = `${nameText}${suffix}`;
			} catch (e) {
				console.warn('更新首頁標題失敗:', e);
			}
		}

		function showCourseDetail(event, course) {
			event.preventDefault();
			event.stopPropagation();
			
			// 開啟外部課程詳細頁面
			const courseDetailData = {
				year: querySelectQueryYear.value,
				smtr: querySelectQuerySmt.value,
				cos_id: course.cos_id,
				cos_class: course.cos_class || 'A'
			};
			
			ipcRenderer.send("openCourseDetail", courseDetailData);
		}

		function status(s) {
			if (s == 0) {
				return "尚未選到"
			} else if (s == 1) {
				return "已選到！恭喜！"
			} else if (s == 2) {
				return "此課程已選過喔！"
			} else {
				return `其他未明狀態 狀態碼 ${s}`
			}
		}

		// 顯示關於模態框
		function showAboutModal() {
			const modal = document.getElementById('about-modal');
			
			if (modal) {
				modal.classList.add('show');
				
				// ESC 鍵關閉模態框
				const handleEsc = (e) => {
					if (e.key === 'Escape') {
						closeAboutModal();
						document.removeEventListener('keydown', handleEsc);
					}
				};
				document.addEventListener('keydown', handleEsc);
			}
		}

		// 關閉關於模態框
		function closeAboutModal() {
			const modal = document.getElementById('about-modal');
			
			if (modal) {
				modal.classList.remove('show');
			}
		}

		onUpdated(() => { })

		onMounted(() => {
			setInterval(() => {
				database.all(`SELECT * FROM tasks`, [], (err, rows) => {
					if (err) {
						throw err;
					}
					tasks.value = rows
				});
			}, 5000)

			document.addEventListener('DOMContentLoaded', function () {
				var options = {};
				// 排除 about-modal，避免自動創建 modal-overlay
				var elems = document.querySelectorAll('.modal:not(#about-modal)');
				var instances = M.Modal.init(elems, options);
			})

			// 全域攔截需登入的功能入口（訪客顯示提示）
			document.addEventListener('click', function (e) {
				const restricted = e.target && e.target.closest('[data-requires-auth="true"]');
				if (restricted && !isLoggedIn.value) {
					e.preventDefault();
					e.stopPropagation();
					if (typeof M !== 'undefined' && M && M.toast) {
						M.toast({ html: '需登入才能使用此功能', displayLength: 4000, classes: 'auth-toast' });
					} else {
						alert('需登入才能使用此功能');
					}
					return false;
				}
			}, true)

			// 先顯示登入畫面，然後在背景載入系所和學期選項
			// 延遲載入，讓登入畫面先顯示
			setTimeout(() => {
				loadInitialCourseOptions();
				setTimeout(() => updateMainHeader(), 50);
			}, 500); // 延遲500ms，讓登入畫面先顯示
		})

		// 新增：載入初始課程選項的函數（背景載入，不阻塞UI）
		function loadInitialCourseOptions() {
			// 如果正在載入或已經載入完成，則不重複載入
			if (isCourseListLoading || (dept_list.value.length > 0 && semester_list_for_time.value.length > 0)) {
				return;
			}
			
			isCourseListLoading = true;
			// 注意：不設定 isCourseDataLoading.value = true，避免影響登入界面的顯示
			
			// 使用當前的年份和學期
			const year = querySelectQueryYear.value || new Date().getFullYear() - 1911;
			const semester = querySelectQuerySmt.value || "1";
			
			apibackend.getCourseListFromYZUApi(`${year}`, `${semester}`).then((data) => {
				// 更新系所清單
				if (data.dept_list && Array.isArray(data.dept_list)) {
					dept_list.value = data.dept_list;
				}
				
				// 更新學期清單（時間查詢用）
				if (data.semester_list && Array.isArray(data.semester_list)) {
					semester_list_for_time.value = filterSemesterListForTime(data.semester_list);
					
					// 設定所有學期選擇器的預設值為最新的學期
					if (semester_list_for_time.value.length > 0) {
						const latestSemester = semester_list_for_time.value[0].value;
						querySelectSemester.value = latestSemester;
						querySelectSemesterForName.value = latestSemester;
						querySelectSemesterForTeacher.value = latestSemester;
						querySelectSemesterForTime.value = latestSemester;
					}
				}
				
				isCourseListLoading = false;
				
			}).catch((error) => {
				isCourseListLoading = false;
				console.error("系所和學期選項載入失敗:", error);
			});
		}

		return {
			// Util UI variable 
			greetings,
			// student login infomation
			sid, spwd, login, browseAsGuest, returnToLogin, isLoggedIn,
			// student infomation
			// UI controlling
			isLoading, loading_text, isCourseDataLoading,
			dept_list,
			semester_list_for_time,
			showSection,
			// School Timetable Query - New variables
			addToSchedule, showCourseInfo, showCourseDetail,
			queryType, queryResultForList, modalCourse,
			// Department query
			querySelectSemester, querySelectQueryDept, querySelectGrade, queryDeptKeyword,
			// Global query params for API
			querySelectQueryYear, querySelectQuerySmt,
			// Course name query  
			querySelectSemesterForName, querySelectDeptForName, querySelectGradeForName, queryInputQueryCourseName,
			// Teacher query
			querySelectSemesterForTeacher, queryInputQueryTeacherName,
			// Time query
			querySelectSemesterForTime, querySelectDeptForTime, querySelectGradeForTime, querySelectQueryDay, querySelectQueryPeriod,
			// Query functions
			performDeptQuery, performNameQuery, performTeacherQuery, performTimeQuery,
			// Task List 
			tasks, status,
			// Settings
			StealCourseInterval, StealCourseStage,
			// Course loading functions
			isPersonalScheduleData, getCourseListForQuery, loadInitialCourseOptions,
			// Modal functions
			showAboutModal, closeAboutModal,
		}
	}
});

// 課表相關功能
window.refreshSchedule = async function() {
	const scheduleLoading = document.getElementById('schedule-loading');
	const scheduleContent = document.getElementById('schedule-content');
	const scheduleError = document.getElementById('schedule-error');
	const refreshBtn = document.getElementById('refresh-schedule');
	const scheduleInfoInner = document.querySelector('#section-Schedule > div.schedule-info > div');
	
	// DOM 保護
	if (!scheduleLoading || !scheduleContent || !scheduleError) {
		console.warn('課表 DOM 尚未載入完成');
		return;
	}

	// 顯示載入狀態並禁用按鈕
	if (refreshBtn) refreshBtn.disabled = true;
	scheduleLoading.style.display = 'block';
	scheduleContent.style.display = 'none';
	scheduleError.style.display = 'none';
	if (scheduleInfoInner) scheduleInfoInner.style.display = 'none';

	try {
		// 固定目前學年學期
		const currentYear = "114";
		const currentSemester = "1";

		// 清除舊的課表資料快取，確保強制重抓
		if (window.apibackend) {
			window.apibackend.course_schedule_data = null;
		}

		// 檢查登入憑證
		if (!window.apibackend || !window.apibackend.ALLDATA?.original_account || !window.apibackend.ALLDATA?.original_password) {
			throw new Error('缺少登入憑證，請先登入後再重試');
		}

		// 重新登入
		await window.apibackend.loginService(
			window.apibackend.ALLDATA.original_account,
			window.apibackend.ALLDATA.original_password
		);

		// Puppeteer 流程重新抓課表
		await window.apibackend.getCourseSchedule(currentYear, currentSemester);

		// 成功後更新畫面
		generateScheduleTable();
		scheduleLoading.style.display = 'none';
		scheduleContent.style.display = 'block';
		// 不再使用舊的 schedule-info 區塊
	} catch (error) {
		console.error('重新載入課表失敗:', error);
		scheduleLoading.style.display = 'none';
		scheduleError.style.display = 'block';
	} finally {
		if (refreshBtn) refreshBtn.disabled = false;
	}
}

window.generateScheduleTable = function() {
	// 顯示課表類型和資料來源
	const scheduleTitle = document.querySelector('.page-header h2');
	const scheduleSubTitle = document.querySelector('.page-header p');
	const scheduleContentContainer = document.querySelector('#schedule-content > div');
	const scheduleTable = document.querySelector('#schedule-content > div > table');
	// 清理舊的資訊樣式（若有）
	if (scheduleSubTitle) {
		scheduleSubTitle.classList.remove('alert', 'alert-light', 'py-2', 'px-3', 'mb-3');
	}
	
	// 檢查課表資料
	if (window.apibackend && window.apibackend.course_schedule_data) {
		const data = window.apibackend.course_schedule_data;
		
		// 更新標題與資訊區塊（合併顯示於副標題）
		if (data.is_personal) {
			if (scheduleTitle) scheduleTitle.textContent = '📋 我的課表';
			if (scheduleSubTitle) {
				if (data.label1_info) {
					// 只顯示：課表資訊：{label1_info}
					scheduleSubTitle.textContent = `課表資訊：${data.label1_info}`;
					// 套用輕量提示樣式
					scheduleSubTitle.classList.add('alert', 'alert-light', 'py-2', 'px-3', 'mb-3');
				} else {
					// 無 label1 時保留原始文案或清空
					// 若需要固定文案，可改為：'114學年度第1學期課程時間表'
					// 現在採用清空避免與表格重複
					scheduleSubTitle.textContent = '';
				}
			}
		} else {
			// 這個分支現在不應該被執行到，因為已移除回退機制
			if (scheduleTitle) scheduleTitle.textContent = '❌ 課表載入失敗';
			if (scheduleSubTitle) {
				scheduleSubTitle.textContent = '';
				scheduleSubTitle.classList.remove('alert', 'alert-light', 'py-2', 'px-3', 'mb-3');
			}
		}
	} else {
		// 沒有課表資料
		if (scheduleTitle) scheduleTitle.textContent = '📅 我的課表';
		if (scheduleSubTitle) {
			// 顯示預設副標題或清空（避免與後續內容重複）
			scheduleSubTitle.textContent = '';
			scheduleSubTitle.classList.remove('alert', 'alert-light', 'py-2', 'px-3', 'mb-3');
		}
	}
	
	// 時間段定義
	const timeSlots = [
		'08:10-09:00', '09:10-10:00', '10:10-11:00', '11:10-12:00',
		'12:10-13:00', '13:10-14:00', '14:10-15:00', '15:10-16:00',
		'16:10-17:00', '17:10-18:00', '18:30-19:20', '19:25-20:15',
		'20:20-21:10'
	];
	
	// 建立課表資料結構 (13個時段 x 7天)
	const scheduleGrid = Array(13).fill(null).map(() => Array(7).fill(null));
	
	// 檢查是否有個人課表資料並填入網格
	if (window.apibackend && window.apibackend.course_schedule_data && window.apibackend.course_schedule_data.is_personal) {
		const data = window.apibackend.course_schedule_data;
		
		if (data.course_list && data.course_list.length > 0) {
			const courses = data.course_list;
			
			courses.forEach(course => {
				
				// 優先使用 day 和 period 屬性（新版本後端提供）
				if (course.day && course.period) {
					const day = course.day;
					const period = course.period;
					
					if (period >= 1 && period <= 13 && day >= 1 && day <= 7) {
						scheduleGrid[period - 1][day - 1] = {
							code: (`${course.cos_id || course.course_id || ''}`.trim()).replace(/\s*\(\s*\d+\s*\)\s*$/, ''),
							name: course.name,
							teacher: course.teacher_name || '未知教師',
							room: course.room || '未知教室'
						};
					}
				} else if (course.time && course.time !== "無課程資料" && course.time !== "時間待確認") {
					// 回退機制：解析時間字串
					
					// 檢查是否是新格式 (如: "第  2  節\n09:10~10:00")
					if (course.time.includes('第') && course.time.includes('節')) {
						// 提取節次數字
						const periodMatch = course.time.match(/第\s*(\d+)\s*節/);
						if (periodMatch) {
							const period = parseInt(periodMatch[1]);
							const day = 1; // 預設週一，因為沒有星期資訊
							
							if (period >= 1 && period <= 13) {
								scheduleGrid[period - 1][day - 1] = {
									code: (`${course.cos_id || course.course_id || ''}`.trim()).replace(/\s*\(\s*\d+\s*\)\s*$/, ''),
									name: course.name,
									teacher: course.teacher_name || '未知教師',
									room: course.room || '未知教室'
								};
							}
						}
					} else {
						// 原有格式 (如: "123,145" 代表週一第2,3節，週一第4,5節)
						const timeInfo = course.time.split(',');
						timeInfo.forEach(timeSlot => {
							if (timeSlot && timeSlot.length >= 3) {
								try {
									const day = parseInt(timeSlot.charAt(0)); // 星期幾 (1-7)
									const periods = timeSlot.substring(1); // 節次
									
									// 為每個節次添加課程
									for (let i = 0; i < periods.length; i++) {
										const period = parseInt(periods.charAt(i));
										if (period >= 1 && period <= 13 && day >= 1 && day <= 7) {
											scheduleGrid[period - 1][day - 1] = {
												code: (`${course.cos_id || course.course_id || ''}`.trim()).replace(/\s*\(\s*\d+\s*\)\s*$/, ''),
												name: course.name,
												teacher: course.teacher_name || '未知教師',
												room: course.room || '未知教室'
											};
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
		}
	}
	
	// 找到現有的表格元素
	const scheduleContent = document.getElementById('schedule-content');
	const existingTbody = document.getElementById('schedule-tbody');
	
	if (!scheduleContent) {
		console.error("找不到 #schedule-content 元素");
		return;
	}
	
	if (!existingTbody) {
		console.error("找不到 #schedule-tbody 元素");
		return;
	}
	
	// 清空現有的 tbody 內容
	existingTbody.innerHTML = '';
	
	// 生成每一行並插入到現有的 tbody
	timeSlots.forEach((time, timeIndex) => {
		const row = document.createElement('tr');
		
		// 時間欄
		const timeCell = document.createElement('td');
		timeCell.style.backgroundColor = '#f8f9fa';
		timeCell.style.fontWeight = 'bold';
		timeCell.style.whiteSpace = 'pre-line';
		timeCell.style.textAlign = 'center';
		timeCell.textContent = `第${timeIndex + 1}節\n${time}`;
		row.appendChild(timeCell);
		
		// 週一到週日
		for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
			const courseData = scheduleGrid[timeIndex][dayIndex];
			const cell = document.createElement('td');
			cell.className = 'schedule-cell';
			cell.style.padding = '6px';
			
			if (courseData) {
				// 直接把三行文字放進 td
				cell.style.whiteSpace = 'pre-line';
				cell.style.fontSize = '16px';
				cell.style.lineHeight = '1.2';
				const fullName = `${courseData.name || ''}`;
				const codeText = courseData.code || '';
				const roomText = courseData.room || '';
				cell.textContent = `${fullName}\n${codeText}\n${roomText}`;
			} else {
				// 沒課程
				const emptyDiv = document.createElement('div');
				emptyDiv.className = 'course-slot';
				emptyDiv.style.padding = '8px';
				emptyDiv.style.textAlign = 'center';
				emptyDiv.style.color = '#999';
				emptyDiv.textContent = '-';
				cell.appendChild(emptyDiv);
			}
			
			row.appendChild(cell);
		}
		
		existingTbody.appendChild(row);
	});
}

// 建立課表資訊顯示元素的輔助函數
function createScheduleInfoElement() {
	// 找到 page-header 或 schedule-controls
	const pageHeader = document.querySelector('.page-header');
	const scheduleControls = document.querySelector('.schedule-controls');
	
	// 創建資訊元素
	const infoDiv = document.createElement('div');
	infoDiv.className = 'schedule-info';
	infoDiv.style.margin = '15px 0';
	
	// 插入到適當位置
	if (pageHeader && scheduleControls) {
		// 在 page-header 和 schedule-controls 之間插入
		pageHeader.parentNode.insertBefore(infoDiv, scheduleControls);
	} else if (pageHeader) {
		// 在 page-header 後面插入
		pageHeader.appendChild(infoDiv);
	} else {
		// 找不到適當位置，在 schedule content 前面插入
		const scheduleContent = document.getElementById('schedule-content');
		if (scheduleContent) {
			scheduleContent.parentNode.insertBefore(infoDiv, scheduleContent);
		}
	}
	
	return infoDiv;
}

app.mount('#app')

// 讓 closeAboutModal 在全域可用
window.closeAboutModal = function() {
	const modal = document.getElementById('about-modal');
	
	if (modal) {
		modal.classList.remove('show');
	}
}
