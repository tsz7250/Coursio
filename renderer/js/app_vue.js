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

		const isLoading = ref(false);  // 是否
		const loading_text = ref("");

		const login_infomation = ref({}); // 儲存登入資訊
		const std_account_infomation = ref({}); // 儲存學生資訊
		const notify_list = ref([]);
		const dept_list = ref([]); // 總學校系級


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

		function showSection(id) {
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
				dept_list.value = data.dept_list;

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
				var a = CourseList.filter(x => x.year == args[0] && x.smtr == args[1] && x.dept_name.includes(args[2]));
				queryResultForList.value = a;
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
		watch(querySelectQueryDept, (newDept, prevDept) => {
			query(queryType.value, querySelectQueryYear.value, querySelectQuerySmt.value, newDept)
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
		})

		return {
			// Util UI variable 
			greetings,
			// student login infomation
			sid, spwd, login,
			// student infomation
			std_account_infomation,
			notify_list,
			// UI controlling
			isLoading, loading_text,
			dept_list,
			showSection,
			// School Timetable Query
			addToSchedule, showCourseInfo,
			queryType, querySelectQueryYear, querySelectQuerySmt, querySelectQueryDept, queryInputQueryCourseName,
			queryInputQueryTeacherName, querySelectQueryDay, querySelectQueryPeriod, queryResultForList, modalCourse,
			// Task List 
			tasks, status,
			// Settings
			StealCourseInterval, StealCourseStage,
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
				courseDiv.style.background = 'linear-gradient(135deg, #00b894 0%, #00a085 100%)';
				courseDiv.style.color = 'white';
				courseDiv.style.padding = '6px';
				courseDiv.style.borderRadius = '4px';
				courseDiv.style.fontSize = '11px';
				courseDiv.style.lineHeight = '1.2';
				courseDiv.style.fontWeight = '500';
				courseDiv.style.cursor = 'pointer';
				courseDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
				
				const nameDiv = document.createElement('div');
				nameDiv.style.fontWeight = 'bold';
				nameDiv.textContent = `✅ ${courseData.name.substring(0, 8)}${courseData.name.length > 8 ? '...' : ''}`;
				
				const teacherDiv = document.createElement('div');
				teacherDiv.style.fontSize = '9px';
				teacherDiv.style.opacity = '0.9';
				teacherDiv.textContent = courseData.teacher;
				
				const roomDiv = document.createElement('div');
				roomDiv.style.fontSize = '9px';
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
