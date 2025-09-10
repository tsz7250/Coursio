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
		const dept_list = ref([]); // 總學校系級

		// 靜態系所清單（依使用者提供順序，去重保留首次）
		const deptOptions = ref([
			{ value: "300", text: "工程學院                      " },
			{ value: "302", text: "　　機械工程學系學士班" },
			{ value: "303", text: "　　化學工程與材料科學學系學士班" },
			{ value: "305", text: "　　工業工程與管理學系學士班" },
			{ value: "309", text: "　　工程學院英語學士班" },
			{ value: "320", text: "　　淨零碳排永續發展學士後專班" },
			{ value: "322", text: "　　機械工程學系碩士班" },
			{ value: "323", text: "　　化學工程與材料科學學系碩士班" },
			{ value: "325", text: "　　工業工程與管理學系碩士班" },
			{ value: "330", text: "　　先進能源碩士學位學程" },
			{ value: "340", text: "　　智慧電子產品製造碩士產學專班" },
			{ value: "352", text: "　　機械工程學系博士班" },
			{ value: "353", text: "　　化學工程與材料科學學系博士班" },
			{ value: "355", text: "　　工業工程與管理學系博士班" },
			{ value: "500", text: "管理學院                      " },
			{ value: "505", text: "　　管理學院學士班" },
			{ value: "530", text: "　　管理學院經營管理碩士班" },
			{ value: "531", text: "　　管理學院財務金融暨會計碩士班" },
			{ value: "532", text: "　　管理學院管理碩士在職專班" },
			{ value: "554", text: "　　管理學院博士班" },
			{ value: "600", text: "人文社會學院                  " },
			{ value: "601", text: "　　應用外語學系學士班" },
			{ value: "602", text: "　　中國語文學系學士班" },
			{ value: "603", text: "　　藝術與設計學系學士班" },
			{ value: "604", text: "　　社會暨政策科學學系學士班" },
			{ value: "608", text: "　　人文社會學院英語學士班" },
			{ value: "621", text: "　　應用外語學系碩士班" },
			{ value: "622", text: "　　中國語文學系碩士班" },
			{ value: "623", text: "　　藝術與設計學系(藝術與設計管理碩士班)" },
			{ value: "624", text: "　　社會暨政策科學學系碩士班" },
			{ value: "656", text: "　　文化產業與文化政策博士學位學程" },
			{ value: "700", text: "資訊學院                      " },
			{ value: "304", text: "　　資訊工程學系學士班" },
			{ value: "701", text: "　　資訊管理學系學士班" },
			{ value: "702", text: "　　資訊傳播學系學士班" },
			{ value: "705", text: "　　資訊學院英語學士班" },
			{ value: "721", text: "　　資訊管理學系碩士班" },
			{ value: "722", text: "　　資訊傳播學系碩士班" },
			{ value: "723", text: "　　資訊社會學碩士學位學程" },
			{ value: "724", text: "　　資訊工程學系碩士班" },
			{ value: "725", text: "　　生物與醫學資訊碩士學位學程" },
			{ value: "751", text: "　　資訊管理學系博士班" },
			{ value: "754", text: "　　資訊工程學系博士班" },
			{ value: "800", text: "電機通訊學院" },
			{ value: "310", text: "　　電機通訊學院英語學士班" },
			{ value: "311", text: "　　電機系甲組" },
			{ value: "312", text: "　　電機系乙組" },
			{ value: "313", text: "　　電機系丙組" },
			{ value: "326", text: "　　(113學年起碩專課程)電機工程學系碩士班" },
			{ value: "331", text: "　　電機碩甲組" },
			{ value: "332", text: "　　電機碩乙組" },
			{ value: "333", text: "　　電機碩丙組" },
			{ value: "359", text: "　　電機博甲組" },
			{ value: "360", text: "　　電機博乙組" },
			{ value: "361", text: "　　電機博丙組" },
			{ value: "301", text: "　　(106學年以前)電機工程學系學士班" },
			{ value: "307", text: "　　(106學年以前)通訊工程學系學士班" },
			{ value: "308", text: "　　(106學年以前)光電工程學系學士班" },
			{ value: "327", text: "　　(106學年以前)通訊工程學系碩士班" },
			{ value: "328", text: "　　(106學年以前)光電工程學系碩士班" },
			{ value: "356", text: "　　(106學年以前)電機工程學系博士班" },
			{ value: "357", text: "　　(106學年以前)通訊工程學系博士班" },
			{ value: "358", text: "　　(106學年以前)光電工程學系博士班" },
			{ value: "A00", text: "醫護學院" },
			{ value: "329", text: "　　生物科技與工程研究所碩士班" },
			{ value: "A11", text: "　　護理學系學士班" },
			{ value: "A21", text: "　　醫學研究所碩士班" },
			{ value: "901", text: "通識教學部"},
			{ value: "903", text: "軍訓室                        " },
			{ value: "904", text: "體育室                        " },
			{ value: "906", text: "國際語言文化中心" },
			{ value: "907", text: "全球事務處" },
			{ value: "908", text: "磨課師" },
			{ value: "910", text: "大專院校人工智慧學程聯盟" },
			{ value: "909", text: "探索跨域" },
		]);

		function getDeptTextByValue(val) {
			const found = deptOptions.value.find(d => d.value === val);
			return found ? found.text : "";
		}

		// 系所代碼對應 cos_id 模式的對照表，支援學士/碩士/博士分離查詢
		const deptCosIdMapping = {
			// 電機通訊學院各組別，支援度階層級區分
			// 學士班 (推測使用 1xx-4xx 範圍)
			"311": { prefix: "EEA", level: "bachelor" }, // 電機系甲組
			"312": { prefix: "EEB", level: "bachelor" }, // 電機系乙組  
			"313": { prefix: "EEC", level: "bachelor" }, // 電機系丙組
			
			// 碩士班 (推測使用 5xx-7xx 範圍)
			"331": { prefix: "EEA", level: "master" },   // 電機碩甲組
			"332": { prefix: "EEB", level: "master" },   // 電機碩乙組
			"333": { prefix: "EEC", level: "master" },   // 電機碩丙組
			
			// 博士班 (推測使用 8xx-9xx 範圍)
			"359": { prefix: "EEA", level: "doctoral" }, // 電機博甲組
			"360": { prefix: "EEB", level: "doctoral" }, // 電機博乙組
			"361": { prefix: "EEC", level: "doctoral" }, // 電機博丙組
			
			// 舊制系所（106學年以前），按學制分類
			"301": { prefix: "EE",  level: "bachelor" }, // (106學年以前)電機工程學系學士班
			"307": { prefix: "COM", level: "bachelor" }, // (106學年以前)通訊工程學系學士班
			"308": { prefix: "OE",  level: "bachelor" }, // (106學年以前)光電工程學系學士班
			"327": { prefix: "COM", level: "master" },   // (106學年以前)通訊工程學系碩士班
			"328": { prefix: "OE",  level: "master" },   // (106學年以前)光電工程學系碩士班
			"356": { prefix: "EE",  level: "doctoral" }, // (106學年以前)電機工程學系博士班
			"357": { prefix: "COM", level: "doctoral" }, // (106學年以前)通訊工程學系博士班
			"358": { prefix: "OE",  level: "doctoral" }, // (106學年以前)光電工程學系博士班
		};

		// 根據學制定義課程編號範圍規則（基於實際資料分析）
		const degreeRangeRules = {
			bachelor: (cosId) => {
				// 學士班課程編號範圍
				const match = cosId.match(/(\d+)$/);
				if (match) {
					const num = parseInt(match[1]);
					return num >= 100 && num <= 499;
				}
				return false;
			},
			master: (cosId) => {
				// 碩士班課程編號範圍  
				const match = cosId.match(/(\d+)$/);
				if (match) {
					const num = parseInt(match[1]);
					return num >= 500 && num <= 799;
				}
				return false;
			},
			doctoral: (cosId) => {
				// 博士班課程編號範圍
				const match = cosId.match(/(\d+)$/);
				if (match) {
					const num = parseInt(match[1]);
					return num >= 800 && num <= 999;
				}
				return false;
			}
		};

		// 學制判斷函數，僅使用數字範圍規則
		function isCourseLevelMatch(course, targetLevel) {
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


		// School Timetable Query
		const queryType = ref("dept")  // 欲搜尋的類型
		const querySelectQueryYear = ref(`${year_now}`)  // 欲搜尋的學年
		const querySelectQuerySmt = ref(`${smtr_now}`)  // 欲搜尋的學期
		const querySelectQueryDept = ref("")  // 欲搜尋的系級

		const queryInputQueryCourseName = ref("")  // 欲搜尋的課程名稱

		const queryInputQueryTeacherName = ref("")  // 欲搜尋的教師名稱

		const querySelectQueryDay = ref("1")   // 欲搜尋的星期
		const querySelectQueryPeriod = ref("01")  // 欲搜尋的課堂時間

		const queryResultForList = ref([]) // 用於儲存已查詢到的課程列表
		const modalCourse = ref({}) // 用於儲存點擊的 Course Info 並顯示於 Modal 中
		var CourseList = []; // 總課程列表
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
						
						// 依序載入課程資料和通知，確保載入狀態正確管理
						return Promise.all([
							getCourseListAsync(),
							getNotifyListAsync()
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
				isCourseListLoading = false;
				isCourseDataLoading.value = false; // 清除UI載入狀態
				console.log("課程資料載入完成（靜默模式）");
			}).catch((error) => {
				isCourseListLoading = false;
				isCourseDataLoading.value = false; // 清除UI載入狀態
				console.error("課程資料下載失敗:", error);
			})
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
		}

		function getCourseList() {

			loading_text.value = "下載課程資料中~";
			isLoading.value = true;

			apibackend.getCourseListFromYZUApi(`${querySelectQueryYear.value}`, `${querySelectQuerySmt.value}`).then((data) => {
				CourseList = data.course_list;

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

		function query(qtype, ...args) {
			if (qtype == "dept") {
				const year = normalizeText(args[0]);
				const smt  = normalizeText(args[1]);
				const deptStrategy = args[2]; // 新的查詢策略物件
				
				let results = [];
				
				if (deptStrategy.usePattern && deptStrategy.cosIdPrefix) {
					// 使用 cos_id 模式匹配並根據學制過濾
					console.log(`使用 cos_id 模式查詢: ${deptStrategy.cosIdPrefix}, 學制: ${deptStrategy.degreeLevel}`);
					
					results = CourseList.filter(x => {
						// 基本條件：年度、學期、前綴匹配
						if (!(normalizeText(x.year) === year &&
							  normalizeText(x.smtr) === smt &&
							  x.cos_id && x.cos_id.startsWith(deptStrategy.cosIdPrefix))) {
							return false;
						}
						
						// 根據學制進一步過濾
						if (deptStrategy.degreeLevel) {
							return isCourseLevelMatch(x, deptStrategy.degreeLevel);
						}
						
						// 如果沒有學制資訊，則返回所有匹配前綴的課程
						return true;
					});
				} else if (deptStrategy.deptName) {
					// 使用傳統的 dept_name 匹配
					console.log(`使用 dept_name 查詢: ${deptStrategy.deptName}`);
					results = CourseList.filter(x =>
						normalizeText(x.year) === year &&
						normalizeText(x.smtr) === smt &&
						normalizeText(x.dept_name) === normalizeText(deptStrategy.deptName)
					);
				}
				
				console.log(`查詢結果: 找到 ${results.length} 門課程`);
				if (deptStrategy.degreeLevel) {
					console.log(`已依據學制 ${deptStrategy.degreeLevel} 進行過濾`);
				}
				queryResultForList.value = results;
			} else if (qtype == "courseName") {
				var a = CourseList.filter(x => x.name == args[0]);
				queryResultForList.value = a;
			} else if (qtype == "teacherName") {
				var a = CourseList.filter(x => x.teacher_name && x.teacher_name.includes(args[0]));
				queryResultForList.value = a;
			} else if (qtype == "courseTime") {
				var time = args[0] + args[1];
				var a = CourseList.filter(x => x.time && x.time.includes(time));
				queryResultForList.value = a;
			}
		}

		watch([querySelectQueryYear, querySelectQuerySmt], ([newYear, newSmt], [prevYear, prevSmt]) => {
			getCourseList()
		})
		watch(querySelectQueryDept, (newDeptValue, prevDeptValue) => {
			const queryStrategy = getDeptQueryStrategy(newDeptValue);
			query(queryType.value, querySelectQueryYear.value, querySelectQuerySmt.value, queryStrategy)
		})
		watch([querySelectQueryDay, querySelectQueryPeriod,], ([newDay, newPeriod], [prevDay, prevPeriod]) => {
			query(queryType.value, newDay, newPeriod)
		})
		watch(queryInputQueryCourseName, (newCN, prevCN) => {
			query(queryType.value, newCN)
		})
		watch(queryInputQueryTeacherName, (newTN, prevTN) => {
			query(queryType.value, newTN)
		})
		watch(queryType, (newqueryType, prevqueryType) => {

			// querySelectQueryYear.value = ""
			// querySelectQuerySmt.value = ""
			querySelectQueryDept.value = ""

			queryInputQueryCourseName.value = ""

			queryInputQueryTeacherName.value = ""

			querySelectQueryDay.value = "1"
			querySelectQueryPeriod.value = "01"

			queryResultForList.value = []
		})

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
			dept_list, deptOptions,
			showSection,
			// School Timetable Query
			addToSchedule, showCourseInfo,
			queryType, querySelectQueryYear, querySelectQuerySmt, querySelectQueryDept, queryInputQueryCourseName,
			queryInputQueryTeacherName, querySelectQueryDay, querySelectQueryPeriod, queryResultForList, modalCourse,
			// Task List 
			tasks, status,
			// Settings
			StealCourseInterval, StealCourseStage,
			// Debug functions
			analyzeCoursePatterns, getDeptQueryStrategy, isCourseLevelMatch,
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
