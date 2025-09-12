const { ipcRenderer } = require("electron");
// BackendService 和 Enumerable 已在 HTML 中載入
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

// 確保 Enumerable 可用
if (typeof Enumerable === 'undefined') {
    // 如果 Enumerable 未定義，建立簡單替代方案
    console.warn("Enumerable 未載入，使用陣列方法替代");
    window.Enumerable = {
        from: function(array) {
            return {
                where: function(predicate) {
                    return {
                        select: function(selector) {
                            return {
                                toArray: function() {
                                    return array.filter(predicate);
                                }
                            };
                        }
                    };
                }
            };
        }
    };
}


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

		const login_infomation = ref({}); // 儲存登入資訊
		const std_account_infomation = ref({}); // 儲存學生資訊
		const notify_list = ref([]);
		const dept_list = ref([]); // 總學校系級，從 OpenData API 動態載入

		// 系所代碼對應 cos_id 模式的對照表，支援學士/碩士/博士分離查詢
		const deptCosIdMapping = {
			// 工程學院各系所
			"322": { prefix: "ME", level: "master" },    // 機械工程學系碩士班
			"325": { prefix: "IE", level: "master" },    // 工業工程與管理學系碩士班
			"352": { prefix: "ME", level: "doctoral" },  // 機械工程學系博士班
			"353": { prefix: "CH", level: "doctoral" },  // 化學工程與材料科學學系博士班
			"355": { prefix: "IE", level: "doctoral" },  // 工業工程與管理學系博士班
			
			// 人文社會學院各系所
			"621": { prefix: "FL", level: "master" },    // 應用外語學系碩士班
			
			// 資訊學院各系所
			"721": { prefix: "IM", level: "master" },    // 資訊管理學系碩士班
			"722": { prefix: "GI", level: "master" },    // 資訊傳播學系碩士班
			"724": { prefix: "CS", level: "master" },    // 資訊工程學系碩士班
			"751": { prefix: "IM", level: "doctoral" },  // 資訊管理學系博士班
			"754": { prefix: "CS", level: "doctoral" },  // 資訊工程學系博士班
			
			// 電機通訊學院各組別，支援學制層級區分
			// 學士班
			"311": { prefix: "EEA", level: "bachelor" }, // 電機系甲組
			"312": { prefix: "EEB", level: "bachelor" }, // 電機系乙組  
			"313": { prefix: "EEC", level: "bachelor" }, // 電機系丙組
			
			// 碩士班
			"331": { prefix: "EEA", level: "master" },   // 電機碩甲組
			"332": { prefix: "EEB", level: "master" },   // 電機碩乙組
			"333": { prefix: "EEC", level: "master" },   // 電機碩丙組
			
			// 博士班
			"359": { prefix: "EEA", level: "doctoral" }, // 電機博甲組
			"360": { prefix: "EEB", level: "doctoral" }, // 電機博乙組
			"361": { prefix: "EEC", level: "doctoral" }, // 電機博丙組
			
			// 舊制系所（106學年以前），按學制分類
			"301": { prefix: "EE",  level: "bachelor" }, // (106學年以前)電機工程學系學士班
			"356": { prefix: "EE",  level: "doctoral" }, // (106學年以前)電機工程學系博士班
			
			// 服務單位
			"903": { prefix: "MT", level: null },        // 軍訓室
			"904": { prefix: "PL", level: null },        // 體育室
		};

		// 根據學制定義課程編號範圍規則（基於實際資料分析）
		const degreeRangeRules = {
			bachelor: (cosId) => {
				// 學士班課程編號範圍，基於實際資料分析
				const match = cosId.match(/[A-Z]+(\d+)/);
				if (match) {
					const num = parseInt(match[1]);
					// 大部分學士班課程在100-499範圍，但允許一些彈性
					return num >= 100 && num <= 499;
				}
				return false;
			},
			master: (cosId) => {
				// 碩士班課程編號範圍，允許一些高編號的碩士課程
				const match = cosId.match(/[A-Z]+(\d+)/);
				if (match) {
					const num = parseInt(match[1]);
					// 碩士班課程主要在500-799範圍，但部分可延伸到800+
					return num >= 500 && num <= 899;
				}
				return false;
			},
			doctoral: (cosId) => {
				// 博士班課程編號範圍，基於實際博士班資料
				const match = cosId.match(/[A-Z]+(\d+)/);
				if (match) {
					const num = parseInt(match[1]);
					// 實際博士班課程範圍較廣，包含特殊低編號(IP)和高編號(CM)
					return num >= 700 || num <= 50; // CM: 724-977, IP: 3-35
				}
				return false;
			}
		};

		// 學制判斷函數，僅使用數字範圍規則
		function isCourseLevelMatch(course, targetLevel) {
			// 如果 targetLevel 為 null，表示該系所不需要學制過濾（如軍訓室、體育室）
			if (targetLevel === null) {
				return true;
			}
			
			const cosId = course.cos_id;
			
			// 使用數字範圍規則進行學制判斷
			if (degreeRangeRules[targetLevel]) {
				return degreeRangeRules[targetLevel](cosId);
			}
			
			return true; // 如果無法判斷，則包含該課程
		}

		// 分析課程資料以確定實際的學制編號模式
		function analyzeCoursePatterns() {
			if (!CourseList || CourseList.length === 0) {
				console.log("課程資料尚未載入，無法分析學制模式");
				return;
			}

			const patterns = {};
			
			// 針對電機系各組別分析 cos_id 模式
			["EEA", "EEB", "EEC"].forEach(prefix => {
				const courses = CourseList.filter(x => x.cos_id && x.cos_id.startsWith(prefix));
				if (courses.length > 0) {
					patterns[prefix] = courses.map(x => ({
						cos_id: x.cos_id,
						name: x.name || x.cos_name,
						dept_name: x.dept_name
					}));
					console.log(`${prefix} 課程範例:`, patterns[prefix].slice(0, 5));
				}
			});

			return patterns;
		}

		// 詳細分析特定系所的查詢結果（除錯用）
		function debugDeptQuery(deptValue) {
			if (!CourseList || CourseList.length === 0) {
				console.log("課程資料尚未載入，無法進行除錯分析");
				return;
			}

			const strategy = getDeptQueryStrategy(deptValue);
			console.log("=== 系所查詢除錯分析 ===");
			console.log("選擇的系所代碼:", deptValue);
			console.log("查詢策略:", strategy);

			if (strategy.usePattern && strategy.cosIdPrefix) {
				const allPrefixCourses = CourseList.filter(x => 
					x.cos_id && x.cos_id.startsWith(strategy.cosIdPrefix)
				);
				console.log(`所有 ${strategy.cosIdPrefix} 前綴課程:`, allPrefixCourses.length, "門");

				// 按系所名稱分組
				const byDept = {};
				allPrefixCourses.forEach(course => {
					const deptName = course.dept_name || 'Unknown';
					if (!byDept[deptName]) byDept[deptName] = [];
					byDept[deptName].push(course);
				});

				Object.keys(byDept).forEach(deptName => {
					console.log(`  ${deptName}: ${byDept[deptName].length} 門課程`);
					const numbers = byDept[deptName].map(c => {
						const match = c.cos_id.match(/(\d+)$/);
						return match ? parseInt(match[1]) : 0;
					}).filter(n => n > 0).sort((a, b) => a - b);
					console.log(`    編號範圍: ${numbers[0]} - ${numbers[numbers.length - 1]}`);
				});

				// 測試學制過濾
				if (strategy.degreeLevel) {
					const filtered = allPrefixCourses.filter(x => isCourseLevelMatch(x, strategy.degreeLevel));
					console.log(`學制過濾後 (${strategy.degreeLevel}):`, filtered.length, "門課程");
					
					// 顯示過濾後的課程範例
					console.log("過濾後課程範例:");
					filtered.slice(0, 10).forEach(course => {
						console.log(`  ${course.cos_id} - ${course.name} (${course.dept_name})`);
					});
				}
			}
			
			return strategy;
		}

		function getDeptQueryStrategy(deptValue) {
			const deptName = getDeptTextByValue(deptValue);
			const mappingInfo = deptCosIdMapping[deptValue];
			
			if (mappingInfo) {
				return {
					deptName: deptName,
					cosIdPrefix: mappingInfo.prefix,
					degreeLevel: mappingInfo.level,
					usePattern: true
				};
			} else {
				return {
					deptName: deptName,
					cosIdPrefix: null,
					degreeLevel: null,
					usePattern: false
				};
			}
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
		const querySelectQueryDay = ref("1")   // 欲搜尋的星期
		const querySelectQueryPeriod = ref("01")  // 欲搜尋的課堂時間

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
			console.log("登入函數被呼叫");
			console.log("學號:", sid.value);
			console.log("密碼長度:", spwd.value.length);
			
			if (sid.value !== "" && spwd.value !== "") {
				console.log("開始登入流程");
				loading_text.value = "登入中";
				isLoading.value = true;

				apibackend._getRSAKey()
					.then((service) => {
						return service._encryptData(sid.value, spwd.value)
					})
					.then((service) => {
						return service._getUserAccessToken()
					}).then((service) => {
						login_infomation.value = service.login_infomation;
						settings["token"] = login_infomation.value["Token"]
						saveSettingFile()
						
						console.log("登入成功！準備取得帳戶資訊...");
						
						// 直接使用傳統的用戶資訊獲取方法
						return service._getAppLoginccount().catch((error) => {
							console.warn("用戶資訊取得失敗，使用基本資訊:", error.message);
							// 創建一個基本的帳戶資訊
							service.std_account_infomation = [{
								"Name": "用戶",
								"StudentID": sid.value,
								"Department": service.ALLDATA["UserStatus"] ? service.ALLDATA["UserStatus"].split('_')[2] : "未知系所"
							}];
							return service;
						});
					}).then((service) => {
						std_account_infomation.value = service.std_account_infomation[0]
						isLoggedIn.value = true;  // 設置登入狀態
						
						console.log("登入流程完成，準備載入課程資料...");
						
						// 依序載入個人課表、全校課程資料和通知，確保載入狀態正確管理
						return Promise.all([
							getCourseListAsync(),           // 載入個人課表
							getCourseListForQueryAsync(),   // 載入全校課程資料用於查詢
							getNotifyListAsync()            // 載入通知
						]).then(() => {
							// 所有資料載入完成後，等待2秒再切換到主畫面
							setTimeout(() => {
								isLoading.value = false;
								loading_text.value = "";
								document.querySelector(".login-panel").classList.add("slide-up")

								setTimeout(() => {
									document.querySelector(".login-panel").style.display = "none";
									document.querySelector(".login-panel").classList.remove("slide-up")
									document.querySelector(".content-panel").style.display = "flex";
								}, 2000);

								// 顯示首頁
								showSectionById("Main")

							}, 2000)
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
				console.log("帳號或密碼為空");
				alert("請輸入學號和密碼");
			}
		}

		// 訪客瀏覽功能
		function browseAsGuest() {
			console.log("訪客瀏覽模式");
			isLoggedIn.value = false;  // 確保訪客狀態
			
			// 設置基本的訪客資訊
			std_account_infomation.value = {
				CName: "訪客",
				StdNo: "guest",
				Department: "訪客模式"
			};
			
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
				console.log("課程資料尚未載入，開始載入...");
				getCourseListSilent();
			} else if (isCourseListLoading) {
				console.log("課程資料正在載入中，請稍候...");
			} else {
				console.log("課程資料已預載入完成，直接使用");
			}
			
			// 訪客模式也需要預先載入全校課程資料用於查詢
			if (!window.allCourseList || window.allCourseList.length === 0) {
				console.log("訪客模式：開始預載入全校課程資料...");
				getCourseListForQueryAsync();
			}
		}

		// 靜默載入課程資料（不顯示載入動畫）
		function getCourseListSilent() {
			// 如果正在載入或已經載入完成，則不重複載入
			if (isCourseListLoading || CourseList.length > 0) {
				console.log("課程資料已載入或正在載入中，跳過重複載入");
				return;
			}
			
			isCourseListLoading = true;
			isCourseDataLoading.value = true; // 設置UI載入狀態
			console.log("開始載入課程資料...");
			
			apibackend.getCourseListFromYZUApi(`${querySelectQueryYear.value}`, `${querySelectQuerySmt.value}`).then((data) => {
				CourseList = data.course_list;
				// 更新系所清單
				if (data.dept_list && Array.isArray(data.dept_list)) {
					dept_list.value = data.dept_list;
					console.log("系所清單載入完成（靜默模式），共", dept_list.value.length, "個系所");
				}
				isCourseListLoading = false;
				isCourseDataLoading.value = false; // 清除UI載入狀態
				console.log("課程資料載入完成（靜默模式）");
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

		// 為課程查詢載入全校課程資料（同步版本，用於頁面切換時）
		function getCourseListForQuery() {
			// 如果正在載入，則不重複載入
			if (isCourseListLoading) {
				console.log("課程資料正在載入中，請稍候...");
				return;
			}
			
			isCourseListLoading = true;
			isCourseDataLoading.value = true; // 設置UI載入狀態
			console.log("開始載入全校課程資料用於查詢...");
			
			apibackend.getCourseListFromYZUApi(`${querySelectQueryYear.value}`, `${querySelectQuerySmt.value}`).then((data) => {
				CourseList = data.course_list;
				// 更新系所清單
				if (data.dept_list && Array.isArray(data.dept_list)) {
					dept_list.value = data.dept_list;
					console.log("系所清單載入完成，共", dept_list.value.length, "個系所");
				}
				isCourseListLoading = false;
				isCourseDataLoading.value = false; // 清除UI載入狀態
				console.log("全校課程資料載入完成，共", CourseList.length, "門課程");
			}).catch((error) => {
				isCourseListLoading = false;
				isCourseDataLoading.value = false; // 清除UI載入狀態
				console.error("全校課程資料載入失敗:", error);
			})
		}

		// 為課程查詢載入全校課程資料（異步版本，用於登入流程中）
		function getCourseListForQueryAsync() {
			console.log("開始載入全校課程資料用於查詢（登入流程）...");
			
			return apibackend.getCourseListFromYZUApi(`${querySelectQueryYear.value}`, `${querySelectQuerySmt.value}`).then((data) => {
				// 將全校課程資料存儲到全域變數中，供課程查詢使用
				window.allCourseList = data.course_list;
				// 更新系所清單
				if (data.dept_list && Array.isArray(data.dept_list)) {
					dept_list.value = data.dept_list;
					console.log("系所清單載入完成（登入流程），共", dept_list.value.length, "個系所");
				}
				console.log("全校課程資料載入完成（登入流程），共", window.allCourseList.length, "門課程");
				return Promise.resolve();
			}).catch((error) => {
				console.error("全校課程資料載入失敗（登入流程）:", error);
				window.allCourseList = []; // 設置為空陣列，避免後續錯誤
				return Promise.resolve(); // 不中斷登入流程
			});
		}

		// 返回登入頁面
		function returnToLogin() {
			// 重置狀態
			isLoggedIn.value = false;
			sid.value = "";
			spwd.value = "";
			login_infomation.value = {};
			std_account_infomation.value = {};
			
			// 顯示登入面板
			document.querySelector(".login-panel").style.display = "flex";
			document.querySelector(".content-panel").style.display = "none";
		}

		function showSection(id) {
			// 檢查是否訪客，如果是訪客只允許訪問課程查詢
			if (!isLoggedIn.value && id !== 'School-timetable-Query') {
				console.log("訪客只能訪問課程查詢功能");
				return;
			}
			
			showSectionById(id)
			
			// 當切換到課表頁面時，自動載入課表資料
			if (id === 'Schedule') {
				console.log("切換到課表頁面，檢查課表資料...");
				// 使用 setTimeout 確保頁面完全顯示後再載入課表
				setTimeout(() => {
					// 如果已經有課表資料，直接生成課表；否則重新載入
					if (window.apibackend && window.apibackend.course_schedule_data && 
						window.apibackend.course_schedule_data.course_list && 
						window.apibackend.course_schedule_data.course_list.length > 0) {
						console.log("使用已載入的課表資料生成課表");
						window.generateScheduleTable();
					} else {
						console.log("重新載入課表資料");
						window.refreshSchedule();
					}
				}, 100);
			}
			
			// 當切換到課程查詢頁面時，檢查並載入全校課程資料
			if (id === 'School-timetable-Query') {
				console.log("切換到課程查詢頁面，檢查課程資料...");
				// 使用 setTimeout 確保頁面完全顯示後再檢查課程資料
				setTimeout(() => {
					// 優先使用預先載入的全校課程資料
					if (window.allCourseList && window.allCourseList.length > 0) {
						console.log("使用預先載入的全校課程資料，共", window.allCourseList.length, "門課程");
						CourseList = window.allCourseList;
					} else if (CourseList.length === 0 || isPersonalScheduleData()) {
						console.log("預先載入的課程資料不可用，重新載入全校課程資料");
						getCourseListForQuery();
					} else {
						console.log("課程資料已載入，可直接使用");
					}
				}, 100);
			}
		}

		function getCourseList() {

			loading_text.value = "下載課程資料中~";
			isLoading.value = true;

			apibackend.getCourseListFromYZUApi(`${querySelectQueryYear.value}`, `${querySelectQuerySmt.value}`).then((data) => {
				CourseList = data.course_list;
				// 更新系所清單
				if (data.dept_list && Array.isArray(data.dept_list)) {
					dept_list.value = data.dept_list;
					console.log("系所清單載入完成，共", dept_list.value.length, "個系所");
				}

				loading_text.value = "下載完成";
				isLoading.value = false;
			}).catch((error) => {
				// 確保下載失敗時清除載入狀態
				console.error("課程資料下載失敗:", error);
				isLoading.value = false;
				loading_text.value = "課程資料下載失敗";
				
				// 2秒後清除錯誤訊息
				setTimeout(() => {
					loading_text.value = "";
				}, 2000);
			})

		}

		// 異步版本的 getCourseSchedule，用於登入流程中取得個人課表
		function getCourseListAsync() {
			loading_text.value = "載入個人課表中~";
			
			return apibackend.getCourseSchedule(`${querySelectQueryYear.value}`, `${querySelectQuerySmt.value}`).then((service) => {
				// 使用個人課表資料
				if (service.course_schedule_data && service.course_schedule_data.course_list) {
					CourseList = service.course_schedule_data.course_list;
					console.log("個人課表載入完成，課程數量:", CourseList.length);
					
					if (service.course_schedule_data.warning) {
						loading_text.value = service.course_schedule_data.warning;
					} else {
						loading_text.value = "個人課表載入完成";
					}
				} else {
					CourseList = [];
					loading_text.value = "無個人課表資料";
				}
				
				return Promise.resolve();
			}).catch((error) => {
				console.error("個人課表載入失敗:", error);
				CourseList = [];
				loading_text.value = "個人課表載入失敗";
				return Promise.resolve(); // 不中斷載入流程，繼續進行
			});
		}

		function getNotifyList() {
			apibackend.getNotifyList().then((service) => {
				notify_list.value = service.notify_list;
				var el = document.querySelector('.content-panel__notifylist');
				SimpleScrollbar.initEl(el);
			}).catch((error) => {
				console.error("通知列表載入失敗:", error);
				// 如果通知載入失敗，不影響主要功能，只記錄錯誤
			})
		}

		// 異步版本的 getNotifyList，用於登入流程中
		function getNotifyListAsync() {
			return apibackend.getNotifyList().then((service) => {
				notify_list.value = service.notify_list;
				var el = document.querySelector('.content-panel__notifylist');
				if (el) SimpleScrollbar.initEl(el);
				return;
			}).catch((error) => {
				console.error("通知列表載入失敗:", error);
				// 通知載入失敗不影響登入流程，繼續執行
				return;
			});
		}

		// 新的查詢功能 - 使用 portalfun.yzu.edu.tw 方法
		async function performDeptQuery() {
			if (!querySelectSemester.value || !querySelectQueryDept.value || !querySelectGrade.value) {
				console.log("系所查詢參數不完整");
				return;
			}

			isCourseDataLoading.value = true;
			
			try {
				console.log("開始系所查詢:", {
					semester: querySelectSemester.value,
					dept: querySelectQueryDept.value,
					grade: querySelectGrade.value
				});
				
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
						credits: course.credits,
						year: querySelectSemester.value.split(',')[0].trim(),
						smtr: querySelectSemester.value.split(',')[1].trim()
					}));
					
					console.log(`系所查詢完成，找到 ${queryResultForList.value.length} 門課程`);
				} else {
					queryResultForList.value = [];
					console.log("系所查詢結果為空");
				}
			} catch (error) {
				console.error("系所查詢失敗:", error);
				queryResultForList.value = [];
			} finally {
				isCourseDataLoading.value = false;
			}
		}

		async function performNameQuery() {
			if (!queryInputQueryCourseName.value.trim()) {
				console.log("課程名稱查詢參數不完整");
				return;
			}
			isCourseDataLoading.value = true;
			try {
				const ddlYM = `${querySelectQueryYear.value || year_now},${querySelectQuerySmt.value || smtr_now}  `;
				console.log("開始課程名稱查詢:", {
					semester: ddlYM,
					courseName: queryInputQueryCourseName.value
				});
				const result = await apibackend.queryCourseByName(
					ddlYM,
					"",
					"0",
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
						credits: course.credits,
						year: ddlYM.split(',')[0].trim(),
						smtr: ddlYM.split(',')[1].trim()
					}));
					console.log(`課程名稱查詢完成，找到 ${queryResultForList.value.length} 門課程`);
				} else {
					queryResultForList.value = [];
					console.log("課程名稱查詢結果為空");
				}
			} catch (error) {
				console.error("課程名稱查詢失敗:", error);
				queryResultForList.value = [];
			} finally {
				isCourseDataLoading.value = false;
			}
		}

		async function performTeacherQuery() {
			if (!querySelectSemesterForTeacher.value || !queryInputQueryTeacherName.value.trim()) {
				console.log("教師姓名查詢參數不完整");
				return;
			}

			isCourseDataLoading.value = true;
			
			try {
				console.log("開始教師姓名查詢:", {
					semester: querySelectSemesterForTeacher.value,
					teacherName: queryInputQueryTeacherName.value
				});
				
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
						credits: course.credits,
						year: querySelectSemesterForTeacher.value.split(',')[0].trim(),
						smtr: querySelectSemesterForTeacher.value.split(',')[1].trim()
					}));
					
					console.log(`教師姓名查詢完成，找到 ${queryResultForList.value.length} 門課程`);
				} else {
					queryResultForList.value = [];
					console.log("教師姓名查詢結果為空");
				}
			} catch (error) {
				console.error("教師姓名查詢失敗:", error);
				queryResultForList.value = [];
			} finally {
				isCourseDataLoading.value = false;
			}
		}

		async function performTimeQuery() {
			if (!querySelectQueryDay.value || !querySelectQueryPeriod.value) {
				console.log("時間查詢參數不完整");
				return;
			}
			isCourseDataLoading.value = true;
			try {
				const ctl216 = querySelectQueryDay.value + querySelectQueryPeriod.value;
				const ddlYM = `${querySelectQueryYear.value || year_now},${querySelectQuerySmt.value || smtr_now}  `;
				console.log("開始時間查詢:", { semester: ddlYM, ctl216 });
				const result = await apibackend.queryCourseByTime(
					ddlYM,
					"",
					"0",
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
						credits: course.credits,
						year: ddlYM.split(',')[0].trim(),
						smtr: ddlYM.split(',')[1].trim()
					}));
					console.log(`時間查詢完成，找到 ${queryResultForList.value.length} 門課程`);
				} else {
					queryResultForList.value = [];
					console.log("時間查詢結果為空");
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
			querySelectQueryDay.value = "1";
			querySelectQueryPeriod.value = "01";
		});

		watch(StealCourseInterval, (newInterval, prevInterval) => {
			settings["interval"] = parseInt(newInterval)
			saveSettingFile()
			ipcRenderer.send("regetSettings", {})
		})

		watch(StealCourseStage, (newStage, prevStage) => {
			settings["stage"] = newStage
			saveSettingFile()
			ipcRenderer.send("regetSettings", {})
		})

		function addToSchedule(event, course) {
			event.preventDefault()
			event.stopPropagation()
			// 通知 worker 加入搶課列表
			var course_obj = JSON.parse(JSON.stringify(course))
			console.log(course_obj);
			ipcRenderer.send("addTaskCourse", course_obj)

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
			
			console.log("Opening course detail for:", courseDetailData);
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
				var elems = document.querySelectorAll('.modal');
				var instances = M.Modal.init(elems, options);
			})

			// 登入界面載入完成後，延遲一點時間再開始載入課程資料，避免影響界面顯示
			setTimeout(() => {
				console.log("登入界面載入完成，開始預載入課程資料...");
				getCourseListSilent();
			}, 1000); // 延遲1秒，讓登入界面完全顯示
		})

		return {
			// Util UI variable 
			greetings,
			// student login infomation
			sid, spwd, login, browseAsGuest, returnToLogin, isLoggedIn,
			// student infomation
			std_account_infomation,
			notify_list,
			// UI controlling
			isLoading, loading_text, isCourseDataLoading,
			dept_list,
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
			// Debug functions (kept for compatibility)
			analyzeCoursePatterns, getDeptQueryStrategy, isCourseLevelMatch, debugDeptQuery,
			// Course loading functions
			isPersonalScheduleData, getCourseListForQuery, getCourseListForQueryAsync,
		}
	}
});

// 課表相關功能
window.refreshSchedule = async function() {
	console.log("開始載入課表...");
	
	const scheduleLoading = document.getElementById('schedule-loading');
	const scheduleContent = document.getElementById('schedule-content');
	const scheduleError = document.getElementById('schedule-error');
	
	// 顯示載入狀態
	scheduleLoading.style.display = 'block';
	scheduleContent.style.display = 'none';
	scheduleError.style.display = 'none';
	
	try {
		// 檢查是否已經有課表資料
		if (window.apibackend && window.apibackend.course_schedule_data) {
			console.log("使用已載入的課表資料");
			generateScheduleTable();
			
			scheduleLoading.style.display = 'none';
			scheduleContent.style.display = 'block';
			return;
		}
		
		// 如果沒有資料，重新載入
		const currentYear = "114";
		const currentSemester = "1";
		
		console.log(`重新載入 ${currentYear} 學年度第 ${currentSemester} 學期課表`);
		
		// 取得課表資料（現在會嘗試個人課表）
		await apibackend.getCourseSchedule(currentYear, currentSemester).then((service) => {
			console.log("課表資料載入成功");
			generateScheduleTable();
			
			scheduleLoading.style.display = 'none';
			scheduleContent.style.display = 'block';
		});
		
	} catch (error) {
		console.error("載入課表失敗:", error);
		scheduleLoading.style.display = 'none';
		scheduleError.style.display = 'block';
	}
}

window.generateScheduleTable = function() {
	console.log("=== generateScheduleTable 函數開始執行 ===");
	
	// 顯示課表類型和資料來源
	const scheduleTitle = document.querySelector('.page-header h2');
	let scheduleInfo = document.querySelector('.schedule-info');
	
	// 先檢查基本的 DOM 元素
	console.log("檢查 DOM 元素:");
	console.log("- scheduleTitle:", scheduleTitle ? "找到" : "未找到");
	console.log("- scheduleInfo:", scheduleInfo ? "找到" : "未找到");
	console.log("- #schedule-content:", document.getElementById('schedule-content') ? "找到" : "未找到");
	console.log("- #schedule-tbody:", document.getElementById('schedule-tbody') ? "找到" : "未找到");
	
	// 如果找不到 schedule-info，創建一個
	if (!scheduleInfo) {
		scheduleInfo = createScheduleInfoElement();
	}
	
	// 檢查課表資料
	if (window.apibackend && window.apibackend.course_schedule_data) {
		const data = window.apibackend.course_schedule_data;
		
		// 更新標題和說明
		if (data.is_personal) {
			if (scheduleTitle) scheduleTitle.textContent = '📋 我的課表';
			
			if (data.course_list && data.course_list.length > 0) {
				// 有個人課表資料
				let infoHtml = `
					<div class="alert alert-success">
						<strong>✅ 個人課表</strong> - 資料來源：${data.source}
						<br><small>📚 共 ${data.course_list.length} 門課程</small>
				`;
				
				// 如果有 label1 資訊，顯示出來
				if (data.label1_info) {
					infoHtml += `<br><small>📋 課表資訊：${data.label1_info}</small>`;
				}
				
				infoHtml += `</div>`;
				scheduleInfo.innerHTML = infoHtml;
			} else {
				// 個人課表為空
				let infoHtml = `
					<div class="alert alert-info">
						<strong>📝 個人課表（空白）</strong>
						<br><small>⚠️ ${data.warning || '目前沒有個人課表資料'}</small>
				`;
				
				// 如果有 label1 資訊，顯示出來
				if (data.label1_info) {
					infoHtml += `<br><small>📋 課表資訊：${data.label1_info}</small>`;
				}
				
				infoHtml += `<br><small>💡 提示：請確認已登入並且有選修課程</small></div>`;
				scheduleInfo.innerHTML = infoHtml;
			}
		} else {
			// 這個分支現在不應該被執行到，因為已移除回退機制
			if (scheduleTitle) scheduleTitle.textContent = '❌ 課表載入失敗';
			scheduleInfo.innerHTML = `
				<div class="alert alert-danger">
					<strong>❌ 無法載入課表</strong>
					<br><small>${data.warning || '課表載入失敗'}</small>
				</div>
			`;
		}
	} else {
		// 沒有課表資料
		if (scheduleTitle) scheduleTitle.textContent = '📅 我的課表';
		scheduleInfo.innerHTML = `
			<div class="alert alert-warning">
				<strong>⏳ 正在準備課表資料</strong>
				<br><small>💡 請稍候或點擊「重新載入課表」按鈕</small>
			</div>
		`;
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
			console.log("找到個人課表資料，開始分析課程時間...");
			
			const courses = data.course_list;
			console.log(`處理 ${courses.length} 門個人課程`);
			
			courses.forEach(course => {
				console.log(`處理課程: ${course.name}, 時間: ${course.time}`);
				
				// 優先使用 day 和 period 屬性（新版本後端提供）
				if (course.day && course.period) {
					const day = course.day;
					const period = course.period;
					
					console.log(`使用後端解析的時間資訊: 星期${day} 第${period}節`);
					
					if (period >= 1 && period <= 13 && day >= 1 && day <= 7) {
						scheduleGrid[period - 1][day - 1] = {
							name: course.name,
							teacher: course.teacher_name || '未知教師',
							room: course.room || '未知教室'
						};
						console.log(`填入課程到網格 [${period-1}][${day-1}]: ${course.name}`);
					}
				} else if (course.time && course.time !== "無課程資料" && course.time !== "時間待確認") {
					// 回退機制：解析時間字串
					console.log(`使用時間字串解析: ${course.time}`);
					
					// 檢查是否是新格式 (如: "第  2  節\n09:10~10:00")
					if (course.time.includes('第') && course.time.includes('節')) {
						// 提取節次數字
						const periodMatch = course.time.match(/第\s*(\d+)\s*節/);
						if (periodMatch) {
							const period = parseInt(periodMatch[1]);
							const day = 1; // 預設週一，因為沒有星期資訊
							
							if (period >= 1 && period <= 13) {
								scheduleGrid[period - 1][day - 1] = {
									name: course.name,
									teacher: course.teacher_name || '未知教師',
									room: course.room || '未知教室'
								};
								console.log(`填入課程到網格 [${period-1}][${day-1}]: ${course.name} (預設週一)`);
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
												name: course.name,
												teacher: course.teacher_name || '未知教師',
												room: course.room || '未知教室'
											};
											console.log(`填入課程到網格 [${period-1}][${day-1}]: ${course.name}`);
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
			
			console.log("個人課表資料分析完成");
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
			
			if (courseData) {
				// 有課程
				const courseDiv = document.createElement('div');
				courseDiv.className = 'course-item';
				courseDiv.style.padding = '6px';
				courseDiv.style.borderRadius = '4px';
				courseDiv.style.fontSize = '13px';
				courseDiv.style.lineHeight = '1.2';
				courseDiv.style.fontWeight = '500';
				
				const nameDiv = document.createElement('div');
				nameDiv.style.fontWeight = 'bold';
				nameDiv.textContent = `${courseData.name.substring(0, 8)}${courseData.name.length > 8 ? '...' : ''}`;
				
				const teacherDiv = document.createElement('div');
				teacherDiv.style.fontSize = '11px';
				teacherDiv.style.opacity = '0.9';
				teacherDiv.textContent = courseData.teacher;
				
				const roomDiv = document.createElement('div');
				roomDiv.style.fontSize = '11px';
				roomDiv.style.opacity = '0.8';
				roomDiv.textContent = courseData.room;
				
				courseDiv.appendChild(nameDiv);
				courseDiv.appendChild(teacherDiv);
				courseDiv.appendChild(roomDiv);
				cell.appendChild(courseDiv);
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
	
	console.log("課表資料已填入現有的表格結構");
	console.log("表格行數:", existingTbody.children.length);
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
