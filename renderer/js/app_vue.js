// BackendService 已移至主程序 (main_ipc.js)，透過 window.electronAPI.backend.* 存取
const { ref, onMounted, onUpdated, computed, watch, shallowRef, nextTick } = Vue;

// 設定檔預設值 — 非同步更新於 onMounted 呼叫 window.electronAPI.settings.read()
let settings = { interval: 2 };

// 覆寫全域對話框：攔截登入失敗提示，派發事件給 Vue 以避免流程卡住
document.addEventListener('DOMContentLoaded', () => {
    try {
        const originalAlert = window.alert;
        const originalConfirm = window.confirm;

        function maybeDispatchLoginFailed(message, source) {
            const text = String(message || '');
            if (text.includes('Login Failed') || text.includes('登入失敗')) {
                window.dispatchEvent(new CustomEvent('yzu:login-failed', {
                    detail: { message: text, source }
                }));
            }
        }

        window.alert = function() {
            try { maybeDispatchLoginFailed(arguments[0], 'alert'); } catch (_) {}
            return originalAlert.apply(window, arguments);
        };

        window.confirm = function() {
            try { maybeDispatchLoginFailed(arguments[0], 'confirm'); } catch (_) {}
            return originalConfirm.apply(window, arguments);
        };
    } catch (_) {}
});

// M-03: year_now, smtr_now, filterSemesterListForTime 已在 store.js（確保所有 page 元件都能使用）


const app = Vue.createApp({
	setup() {
		const router = VueRouter.useRouter();
		/**
		 * Variables
		 */
		const sid = ref("");
		const spwd = ref("");
		
		// 防抖動機制 - 改善輸入響應性
		let sidDebounceTimer = null;
		let spwdDebounceTimer = null;
		const debounceDelay = 50; // 50ms 防抖動延遲

		const greetings = ref("")
		const isLoggedIn = computed({ get: () => Store.isLoggedIn, set: v => { Store.isLoggedIn = v; } });

		const isLoading = computed({ get: () => Store.isLoading, set: v => { Store.isLoading = v; } });
		const loading_text = computed({ get: () => Store.loadingText, set: v => { Store.loadingText = v; } });
		
		// 優化響應式更新 - 使用 shallowRef 減少深度監聽開銷
		const inputStates = shallowRef({
			sid: "",
			spwd: "",
			sidValid: false,
			spwdValid: false
		});

		const semester_list_for_time = ref([]); // 時間查詢用的學期清單，從 API 動態載入
		const dept_list = ref([]); // 系所清單，從 API 動態載入

		// 防抖動處理函數 - 改善輸入響應性
		function debounceInput(field, value, timerRef) {
			// 清除之前的計時器
			if (timerRef.value) {
				clearTimeout(timerRef.value);
			}
			
			// 立即更新顯示值（不等待防抖動）
			if (field === 'sid') {
				sid.value = value;
			} else if (field === 'spwd') {
				spwd.value = value;
			}
			
			// 添加視覺回饋 - 輸入中狀態
			const inputElement = document.getElementById(field === 'sid' ? 'student_id' : 'student_pwd');
			if (inputElement) {
				inputElement.classList.add('input-typing');
			}
			
			// 設置防抖動計時器，延遲更新內部狀態
			timerRef.value = setTimeout(() => {
				// 使用 nextTick 確保在 DOM 更新後執行
				nextTick(() => {
					const isValid = validateField(field, value);
					
					// 更新內部狀態
					inputStates.value = {
						...inputStates.value,
						[field]: value,
						[field + 'Valid']: isValid
					};
					
					// 更新視覺回饋
					if (inputElement) {
						inputElement.classList.remove('input-typing');
						if (value.length > 0) {
							inputElement.classList.add(isValid ? 'input-valid' : 'input-invalid');
						} else {
							inputElement.classList.remove('input-valid', 'input-invalid');
						}
					}
				});
			}, debounceDelay);
		}
		
		// 欄位驗證函數
		function validateField(field, value) {
			if (field === 'sid') {
				return /^s[0-9]{7}$/.test(value);
			} else if (field === 'spwd') {
				return value && value.length > 0;
			}
			return false;
		}
		
		// 優化的輸入處理函數
		function handleSidInput(event) {
			const value = event.target.value;
			debounceInput('sid', value, { value: sidDebounceTimer });
		}
		
		function handleSpwdInput(event) {
			const value = event.target.value;
			debounceInput('spwd', value, { value: spwdDebounceTimer });
		}

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

		// M-03: filterSemesterListForTime 已移至 store.js（全域共用函數）











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

		/**
		 * Functions
		 */
		function escapeHtml(str) {
			return String(str || '')
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#039;');
		}

		function showToastError(message, title = '登入失敗') {
			const html = `<span class="toast-error-content">
				<i class="fas fa-exclamation-circle toast-error-icon"></i>
				<strong class="toast-error-title">${escapeHtml(title)}</strong>
				<span class="toast-error-message">${escapeHtml(message)}</span>
			</span>`;
			if (typeof M !== 'undefined' && M && M.toast) {
				M.toast({ html, displayLength: 4000, classes: 'red darken-2 rounded login-error-toast' });
			} else {
				alert(`${title}：${message}`);
			}
		}
		// 登入並取得學生名字（先驗證後切頁）
		async function login() {
			// 防止重複點擊
			if (isLoading.value) {
				return;
			}
			
			if (sid.value !== "" && spwd.value !== "") {
				loading_text.value = "正在驗證帳號密碼...";
				isLoading.value = true;
				
				// 確保載入面板完全覆蓋整個螢幕，避免閃爍
				const loadingPanel = document.getElementById('loading-panel');
				if (loadingPanel) {
					loadingPanel.style.cssText = `
						position: fixed !important;
						top: 0 !important;
						left: 0 !important;
						width: 100% !important;
						height: 100% !important;
						z-index: 2000 !important;
						background: #ffffff !important;
						display: flex !important;
						flex-direction: column !important;
						align-items: center !important;
						justify-content: center !important;
						transition: opacity 0.3s ease-in-out !important;
					`;
				}

				// 訂閱 Puppeteer 進度事件
				let cleanupProgress = null;
				try {
					cleanupProgress = window.electronAPI.puppeteer.onProgress(step => {
						loading_text.value = step;
					});
				} catch (_) {}

				try {
					// 1) 設定帳號密碼到後端
					await window.electronAPI.backend.setSidSpwd(sid.value, spwd.value);
					
					// 2) 透過 IPC 進行 Puppeteer 登入
					loading_text.value = "驗證帳密中...";
					const loginResult = await window.electronAPI.puppeteer.login(sid.value, spwd.value);
					
					if (!loginResult || !loginResult.success) {
						throw new Error(loginResult && loginResult.message ? loginResult.message : '登入失敗');
					}

					// 3) 登入驗證成功後立即切換到首頁，提升用戶體驗
					loading_text.value = "登入成功，正在載入資料...";
					isLoggedIn.value = true;
					
					// 先準備內容面板，避免閃爍
					const loginPanel = document.querySelector(".login-panel");
					const contentPanel = document.querySelector(".content-panel");
					
					// 立即顯示內容面板（但設為透明）
					contentPanel.style.display = "flex";
					contentPanel.style.opacity = "0";
					contentPanel.style.transition = "opacity 0.3s ease-in-out";
					
					// 開始登入面板滑動動畫
					loginPanel.classList.add("slide-up");
					
					// 在動畫進行到一半時開始淡入內容面板
					setTimeout(() => {
						contentPanel.style.opacity = "1";
						router.push({ name: 'Main' });
						setTimeout(() => updateMainHeader(), 50);
					}, 400);
					
					// 動畫完成後清理
					setTimeout(() => {
						loginPanel.style.display = "none";
						loginPanel.classList.remove("slide-up");
						contentPanel.style.transition = "";
					}, 800);
					
					// 立即隱藏載入面板，讓滑動動畫正常進行
					const loadingPanelHide = document.getElementById('loading-panel');
					if (loadingPanelHide) {
						isLoading.value = false;
						loading_text.value = "";
						loadingPanelHide.style.cssText = '';
					}

					// 在背景完成課表載入和課程查詢資料載入
					window.isBackgroundLoadingSchedule = true;
					
					Promise.allSettled([
						// 透過 IPC 取得個人課表（使用已登入的 puppeteer session）
						(async () => {
							try {
								const scheduleResult = await window.electronAPI.puppeteer.getSchedule();
								if (scheduleResult && scheduleResult.success && scheduleResult.data) {
									window.courseScheduleData = scheduleResult.data;
								} else {
									throw new Error(scheduleResult?.message || '課表載入失敗');
								}
							} catch (error) {
								console.error("❌ 背景課表載入失敗:", error.message);
								window.courseScheduleData = null;
								throw error;
							}
						})(),
						// 載入課程查詢資料
						getCourseListForQuery({ showLoading: false, returnPromise: true, storeInWindow: true })
					]).then(() => {
						console.log("✅ 所有背景資料載入完成");
						window.isBackgroundLoadingSchedule = false;
						
						// 檢查當前是否在課表頁面，並自動生成課表
						const scheduleSection = document.getElementById('section-Schedule');
						const isScheduleVisible = scheduleSection && scheduleSection.classList.contains('is-shown');
						
						if (isScheduleVisible) {
							setTimeout(() => {
								if (window.courseScheduleData && window.courseScheduleData.course_list &&
									window.courseScheduleData.course_list.length > 0) {
									window.generateScheduleTable();
								}
							}, 100);
						}
					}).catch((error) => {
						console.warn("⚠️ 背景資料載入失敗:", error);
						window.isBackgroundLoadingSchedule = false;
						
						const scheduleSection = document.getElementById('section-Schedule');
						const isScheduleVisible = scheduleSection && scheduleSection.classList.contains('is-shown');
						
						if (isScheduleVisible) {
							setTimeout(() => {
								const scheduleLoading = document.getElementById('schedule-loading');
								const scheduleContent = document.getElementById('schedule-content');
								const scheduleError = document.getElementById('schedule-error');
								
								if (scheduleLoading) scheduleLoading.style.display = 'none';
								if (scheduleContent) scheduleContent.style.display = 'none';
								if (scheduleError) scheduleError.style.display = 'block';
							}, 100);
						}
					});

				} catch (error) {
					console.error("登入失敗:", error);
					
					const loadingPanelErr = document.getElementById('loading-panel');
					if (loadingPanelErr) {
						isLoading.value = false;
						loading_text.value = "";
						loadingPanelErr.style.cssText = '';
					}
					
					showToastError(error.message || String(error));
				} finally {
					if (cleanupProgress) { try { cleanupProgress(); } catch (_) {} }
				}
			} else {
				alert("請輸入學號和密碼");
			}
		}

		// 訪客瀏覽功能
		function browseAsGuest() {
			isLoggedIn.value = false;  // 確保訪客狀態
			
			// 先準備內容面板，避免閃爍
			const loginPanel = document.querySelector(".login-panel");
			const contentPanel = document.querySelector(".content-panel");
			
			// 立即顯示內容面板（但設為透明）
			contentPanel.style.display = "flex";
			contentPanel.style.opacity = "0";
			contentPanel.style.transition = "opacity 0.3s ease-in-out";
			
			// 開始登入面板滑動動畫
			loginPanel.classList.add("slide-up");
			
			// 在動畫進行到一半時開始淡入內容面板
			setTimeout(() => {
				contentPanel.style.opacity = "1";
				// 直接顯示課程查詢頁面
				router.push({ name: 'CourseQuery' });
			}, 400); // 動畫進行到一半時
			
			// 動畫完成後清理
			setTimeout(() => {
				loginPanel.style.display = "none";
				loginPanel.classList.remove("slide-up");
				contentPanel.style.transition = ""; // 清除過渡效果
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
			
			window.electronAPI.backend.getCourseList(`${querySelectQueryYear.value}`, `${querySelectQuerySmt.value}`).then((data) => {
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
			
			const promise = window.electronAPI.backend.getCourseList(`${year}`, `${semester}`).then((data) => {
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
			
			// 平滑切換回登入面板
			const loginPanel = document.querySelector(".login-panel");
			const contentPanel = document.querySelector(".content-panel");
			
			// 先淡出內容面板
			contentPanel.style.transition = "opacity 0.3s ease-in-out";
			contentPanel.style.opacity = "0";
			
			setTimeout(() => {
				// 隱藏內容面板，顯示登入面板
				contentPanel.style.display = "none";
				contentPanel.style.transition = ""; // 清除過渡效果
				loginPanel.style.display = "flex";
				loginPanel.classList.remove("slide-up"); // 確保重置動畫狀態
			}, 300);
		}

		function navigateTo(name) {
			router.push({ name });
		}

		function showSection(id) {
			// 保留向後相容
			navigateFromSectionId(id);
			
			// 當切換到首頁時，更新問候語（顯示學號或訪客）
			if (id === 'Main') {
				setTimeout(() => updateMainHeader(), 50);
			}

			// 當切換到課表頁面時，自動載入課表資料
			if (id === 'Schedule') {
				// 使用 setTimeout 確保頁面完全顯示後再載入課表
				setTimeout(() => {
					// 如果已經有課表資料，直接生成課表
					if (window.courseScheduleData && 
						window.courseScheduleData.course_list && 
						window.courseScheduleData.course_list.length > 0) {
						window.generateScheduleTable();
					} else {
						// 檢查是否正在背景載入課表資料
						if (window.isBackgroundLoadingSchedule) {
							console.log("⏳ 課表資料正在背景載入中，等待完成...");
							// 顯示載入狀態
							const scheduleLoading = document.getElementById('schedule-loading');
							const scheduleContent = document.getElementById('schedule-content');
							const scheduleError = document.getElementById('schedule-error');
							if (scheduleLoading) scheduleLoading.style.display = 'block';
							if (scheduleContent) scheduleContent.style.display = 'none';
							if (scheduleError) scheduleError.style.display = 'none';
						} else {
							// 檢查是否有課表載入錯誤
						const hasScheduleError = Store.courseScheduleData === null && !Store.isBackgroundLoadingSchedule;
							
							if (hasScheduleError) {
								console.log("❌ 課表載入失敗，顯示錯誤狀態");
								const scheduleLoading = document.getElementById('schedule-loading');
								const scheduleContent = document.getElementById('schedule-content');
								const scheduleError = document.getElementById('schedule-error');
								if (scheduleLoading) scheduleLoading.style.display = 'none';
								if (scheduleContent) scheduleContent.style.display = 'none';
								if (scheduleError) scheduleError.style.display = 'block';
							} else {
								// 只有在非登入流程中才重新載入課表
								console.log("🔄 沒有課表資料，重新載入課表");
								// 檢查是否已經在執行中，避免重複調用
								if (!window.isRefreshingSchedule) {
									window.refreshSchedule();
								} else {
									console.log("⚠️ 課表正在載入中，跳過自動重新載入");
								}
							}
						}
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

			// 當切換到自動選課頁面時，才執行一次性 Python 環境檢查
			if (id === 'Auto-Selection') {
				setTimeout(() => {
					try {
						if (window.courseSelectionController && typeof window.courseSelectionController.checkEnvironment === 'function') {
							// 僅在尚未初始化時觸發
							if (!window.courseSelectionController.isInitialized) {
								window.courseSelectionController.checkEnvironment();
							}
						}
					} catch (e) {
						console.warn('進入自動選課頁時觸發檢查失敗:', e);
					}
				}, 100);
			}
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
				
				const result = await window.electronAPI.backend.queryCourseByDept(
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
						credit: 0, // 初始值，稍後載入
						credit_loading: true, // 標記為載入中
						year: querySelectSemester.value.split(',')[0].trim(),
						smtr: querySelectSemester.value.split(',')[1].trim()
					}));
					
					// 異步載入學分數
					loadCourseCredits(queryResultForList.value);
					
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
				const result = await window.electronAPI.backend.queryCourseByName(
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
						credit: 0, // 初始值，稍後載入
						credit_loading: true, // 標記為載入中
						year: ddlYM.split(',')[0].trim(),
						smtr: ddlYM.split(',')[1].trim()
					}));
					
					// 異步載入學分數
					loadCourseCredits(queryResultForList.value);
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
				
				const result = await window.electronAPI.backend.queryCourseByTeacher(
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
						credit: 0, // 初始值，稍後載入
						credit_loading: true, // 標記為載入中
						year: querySelectSemesterForTeacher.value.split(',')[0].trim(),
						smtr: querySelectSemesterForTeacher.value.split(',')[1].trim()
					}));
					
					// 異步載入學分數
					loadCourseCredits(queryResultForList.value);
					
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
				const result = await window.electronAPI.backend.queryCourseByTime(
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
						credit: 0, // 初始值，稍後載入
						credit_loading: true, // 標記為載入中
						year: querySelectSemesterForTime.value.split(',')[0].trim(),
						smtr: querySelectSemesterForTime.value.split(',')[1].trim()
					}));
					
					// 異步載入學分數
					loadCourseCredits(queryResultForList.value);
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

		// 異步載入課程學分數
		async function loadCourseCredits(courses) {
			if (!courses || courses.length === 0) return;
			
			// 使用 Promise.allSettled 並行載入所有課程的學分數，避免阻塞
			const creditPromises = courses.map(async (course, index) => {
				try {
					// 添加小延遲避免過於頻繁的請求
					await new Promise(resolve => setTimeout(resolve, index * 100));
					
					const credit = await window.electronAPI.backend.getCourseCredit(
						course.year,
						course.smtr,
						course.cos_id,
						course.cos_class
					);
					
					// 更新課程的學分數
					course.credit = credit;
					course.credit_loading = false;					
				} catch (error) {
					console.error(`載入課程 ${course.cos_id} 學分數失敗:`, error);
					course.credit = 0;
					course.credit_loading = false;
				}
			});
			
			// 等待所有學分數載入完成
			await Promise.allSettled(creditPromises);
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

		watch(StealCourseInterval, (newInterval) => {
			settings['interval'] = parseInt(newInterval);
			Store.settings = Object.assign({}, settings);
			window.electronAPI.settings.write(settings).catch(() => {});
		})

		// 資料驗證函數（簡化版）
		function validateCourseData(courseData) {
			const errors = [];
			
			// 必要欄位檢查
			if (!courseData.cos_id || courseData.cos_id.trim() === '') {
				errors.push('課程代碼不能為空');
			}
			if (!courseData.name || courseData.name.trim() === '') {
				errors.push('課程名稱不能為空');
			}
			if (!courseData.dept_id || courseData.dept_id.trim() === '') {
				errors.push('系所代號不能為空');
			}
			
			// 資料格式檢查
			if (courseData.credit && (isNaN(courseData.credit) || courseData.credit < 0)) {
				errors.push('學分數必須為非負整數');
			}
			
			return {
				isValid: errors.length === 0,
				errors: errors
			};
		}

		async function addToSchedule(event, course) {
			event.preventDefault()
			event.stopPropagation()
			
			try {
				// 準備課程資料（簡化版）
				const courseData = {
					cos_id: course.cos_id || '',
					cos_class: course.cos_class || 'A',
					name: course.name || course.cos_name || '',
					teacher_name: course.teacher_name || course.teacher || '',
					credit: course.credit || course.credits || 0,
					dept_id: '', // 從查詢頁面的系所選擇器取得
					status: 0 // 0 = 尚未選到
				};
				
				// 從查詢頁面的系所選擇器取得系所代號
				const deptSelectElement = document.querySelector("#querySelectQueryDept");
				if (deptSelectElement && deptSelectElement.value) {
					courseData.dept_id = deptSelectElement.value;
				}
				
				console.log('📝 準備新增課程資料:', courseData);
				
				// 資料驗證
				const validation = validateCourseData(courseData);
				if (!validation.isValid) {
					console.error('❌ 資料驗證失敗:', validation.errors);
					alert('❌ 資料驗證失敗:\n' + validation.errors.join('\n'));
					return;
				}
				
				// 透過 IPC 檢查課程是否已存在
				const existingCourse = await window.electronAPI.db.checkTaskExists(courseData.cos_id, courseData.cos_class);
				
				if (existingCourse) {
					alert(`⚠️ 課程 ${courseData.cos_id}${courseData.cos_class} 已存在於選課清單中`);
					return;
				}
				
				// 透過 IPC 新增選課任務
				const result = await window.electronAPI.db.addTask(courseData);
				
				if (result) {
					alert(`✅ 課程 ${courseData.cos_id}${courseData.cos_class} - ${courseData.name} 已加入選課清單！\n\n請前往「選課任務列表」查看，或使用「自動選課」功能。`);
				} else {
					alert('❌ 課程加入失敗，請檢查選課任務列表');
				}
				
			} catch (error) {
				console.error('❌ 加入選課清單失敗:', error);
				alert('❌ 加入選課清單失敗: ' + error.message);
			}
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
			
			window.electronAPI.openCourseDetail(courseDetailData);
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

		// 刪除任務並立即刷新
		async function deleteTask(id) {
			if (!id && id !== 0) return;
			const confirmed = confirm('確定要刪除此課程嗎？');
			if (!confirmed) return;

			try {
				// 透過 IPC 刪除任務
				await window.electronAPI.db.deleteTask(id);
				console.log('✅ 任務刪除成功:', id);

				// 立即刷新列表
				const allTasks = await window.electronAPI.db.getAllTasks();
				tasks.value = allTasks || [];

				if (typeof M !== 'undefined' && M && M.toast) {
					M.toast({ html: `🗑️ 已刪除任務 #${id}`, displayLength: 2000 });
				}
			} catch (error) {
				console.error('❌ 刪除任務失敗:', error);
				if (typeof M !== 'undefined' && M && M.toast) {
					M.toast({ html: `刪除失敗：${error.message}`, displayLength: 3000, classes: 'red' });
				} else {
					alert(`刪除失敗：${error.message}`);
				}
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
			// 監聽全域登入失敗事件（由覆寫的 alert/confirm 觸發）
			window.addEventListener('yzu:login-failed', (ev) => {
				try {
					// 立即隱藏載入面板
					const loadingPanel = document.getElementById('loading-panel');
					if (loadingPanel) {
						isLoading.value = false;
						loading_text.value = '';
						// 重置載入面板樣式
						loadingPanel.style.cssText = '';
					}
					
					const msg = (ev && ev.detail && ev.detail.message) ? ev.detail.message : '登入失敗';
					showToastError(msg);
				} catch (e) { console.warn('處理登入失敗事件時發生錯誤', e); }
			});

			// 從主程序讀取設定（非同步，不阻塞 UI）
			window.electronAPI.settings.read().then(s => {
				if (s) {
					settings = s;
					Store.settings = s;
					StealCourseInterval.value = s.interval !== undefined ? s.interval : 2;
					StealCourseStage.value = s.stage !== undefined ? s.stage : '1';
				}
			}).catch(() => {});

			// 資料庫輪詢（直接啟動，無需等待預熱）
			if (!window._dbPollingInterval) {
				window._dbPollingInterval = setInterval(async () => {
					try {
						const allTasks = await window.electronAPI.db.getAllTasks();
						tasks.value = allTasks || [];
					} catch (error) {
						console.error('❌ 輪詢任務列表失敗:', error);
					}
				}, 5000);
			}

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

			// 載入關於模態框
			fetch('./components/about-modal.html')
				.then(r => r.text())
				.then(html => {
					const container = document.getElementById('about-modal-container');
					if (container) container.innerHTML = html;
				})
				.catch(() => {});

			// 直接載入系所和學期選項（無需等待預熱）
			loadInitialCourseOptions();
			setTimeout(() => updateMainHeader(), 50);
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
			
			window.electronAPI.backend.getCourseList(`${year}`, `${semester}`).then((data) => {
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
			// 優化的輸入處理函數
			handleSidInput, handleSpwdInput, inputStates,
			// student infomation
			// UI controlling
			isLoading, loading_text, isCourseDataLoading,
			dept_list,
			semester_list_for_time,
			navigatedTo: navigateTo,
			navigatedToAlias: navigateTo,
			navigated: navigateTo,
			navigated2: navigateTo,
			navigateTo,
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
			tasks, status, deleteTask,
			// Settings
			StealCourseInterval,
			// Course loading functions
			isPersonalScheduleData, getCourseListForQuery, loadInitialCourseOptions, loadCourseCredits,
			// Modal functions
			showAboutModal, closeAboutModal,
		}
	}
});

// 課表相關功能
window.refreshSchedule = async function() {
	// 防止重複執行
	if (window.isRefreshingSchedule) {
		console.warn('⚠️ 課表正在重新載入中，請勿重複點擊');
		return;
	}
	
	console.log('🔄 refreshSchedule 開始執行，設置執行標記');
	window.isRefreshingSchedule = true;
	
	const scheduleLoading = document.getElementById('schedule-loading');
	const scheduleContent = document.getElementById('schedule-content');
	const scheduleError = document.getElementById('schedule-error');
	const refreshBtn = document.getElementById('refresh-schedule');
	const scheduleInfoInner = document.querySelector('#section-Schedule > div.schedule-info > div');
	
	// DOM 保護
	if (!scheduleLoading || !scheduleContent || !scheduleError) {
		console.warn('課表 DOM 尚未載入完成');
		window.isRefreshingSchedule = false;
		return;
	}

	// 顯示載入狀態並禁用按鈕
	if (refreshBtn) refreshBtn.disabled = true;
	scheduleLoading.style.display = 'block';
	scheduleContent.style.display = 'none';
	scheduleError.style.display = 'none';
	if (scheduleInfoInner) scheduleInfoInner.style.display = 'none';

	try {
		// 清除舊的課表資料快取
		window.courseScheduleData = null;

		// 透過 IPC 重新載入課表
		const scheduleResult = await window.electronAPI.puppeteer.getSchedule();
		if (!scheduleResult || !scheduleResult.success) {
			throw new Error(scheduleResult?.message || '課表載入失敗，請確認已登入');
		}
		window.courseScheduleData = scheduleResult.data;

		// 成功後更新畫面
		generateScheduleTable();
		scheduleLoading.style.display = 'none';
		scheduleContent.style.display = 'block';
	} catch (error) {
		console.error('重新載入課表失敗:', error);
		scheduleLoading.style.display = 'none';
		scheduleError.style.display = 'block';
	} finally {
		// 重新啟用按鈕並清除執行標記
		console.log('🔄 refreshSchedule 執行完成，清除執行標記');
		if (refreshBtn) refreshBtn.disabled = false;
		window.isRefreshingSchedule = false;
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
	if (window.courseScheduleData) {
		const data = window.courseScheduleData;
		
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
	if (window.courseScheduleData && window.courseScheduleData.is_personal) {
		const data = window.courseScheduleData;
		
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
			timeCell.className = 'schedule-time-cell';
			timeCell.textContent = `第${timeIndex + 1}節\n${time}`;
		row.appendChild(timeCell);
		
		// 週一到週日
		for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
			const courseData = scheduleGrid[timeIndex][dayIndex];
				const cell = document.createElement('td');
				cell.className = 'schedule-cell schedule-course-cell';
				
				if (courseData) {
					// 直接把三行文字放進 td
					cell.classList.add('has-course');
					const fullName = `${courseData.name || ''}`;
					const codeText = courseData.code || '';
					const roomText = courseData.room || '';
					cell.textContent = `${fullName}\n${codeText}\n${roomText}`;
				} else {
					// 沒課程
					const emptyDiv = document.createElement('div');
					emptyDiv.className = 'schedule-course-slot';
					emptyDiv.textContent = '-';
					cell.appendChild(emptyDiv);
				}
			
			row.appendChild(cell);
		}
		
		existingTbody.appendChild(row);
	});
	
	// 更新 Store 狀態讓 SchedulePage v-show 正確顯示
	Store.scheduleViewState = 'content';
	console.log('課表已生成並顯示');;
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

// 向後相容：showSectionById 和 navigateFromSectionId 對應 router
function navigateFromSectionId(id) {
	const nameMap = {
		'Main': 'Main',
		'Schedule': 'Schedule',
		'School-timetable-Query': 'CourseQuery',
		'Auto-Selection': 'AutoSelection',
		'Settings': 'Settings',
	};
	const name = nameMap[id];
	if (name) {
		try {
			const r = app.config.globalProperties.$router;
			if (r) r.push({ name });
		} catch (_) {}
	}
}

app.use(router);
app.mount('#app');

// 讓 closeAboutModal 在全域可用
window.closeAboutModal = function() {
	const modal = document.getElementById('about-modal');
	
	if (modal) {
		modal.classList.remove('show');
	}
}
