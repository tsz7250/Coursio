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
		// 使用當前學年學期 (114學年度第1學期)
		const currentYear = "114";
		const currentSemester = "1";
		
		console.log(`載入 ${currentYear} 學年度第 ${currentSemester} 學期課表`);
		
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
	const tbody = document.getElementById('schedule-tbody');
	tbody.innerHTML = '';
	
	// 顯示課表類型和資料來源
	const scheduleTitle = document.querySelector('.page-header h2');
	let scheduleInfo = document.querySelector('.schedule-info');
	
	// 如果找不到 schedule-info，創建一個
	if (!scheduleInfo) {
		scheduleInfo = createScheduleInfoElement();
	}
	
	if (apibackend.course_schedule_data) {
		const data = apibackend.course_schedule_data;
		
		// 更新標題和說明
		if (data.is_personal) {
			if (scheduleTitle) scheduleTitle.textContent = '📋 我的課表';
			scheduleInfo.innerHTML = `
				<div class="alert alert-success">
					<strong>✅ 個人課表</strong> - 資料來源：${data.source}
				</div>
			`;
		} else {
			if (scheduleTitle) scheduleTitle.textContent = '📚 課程瀏覽';
			scheduleInfo.innerHTML = `
				<div class="alert alert-warning">
					<strong>⚠️ 公開課程資料</strong> - ${data.warning || '顯示全校課程，非個人課表'}
					<br><small>💡 提示：登入後可嘗試取得個人課表</small>
				</div>
			`;
		}
	}
	
	// 時間段定義
	const timeSlots = [
		'08:10-09:00', '09:10-10:00', '10:10-11:00', '11:10-12:00',
		'12:10-13:00', '13:10-14:00', '14:10-15:00', '15:10-16:00',
		'16:10-17:00', '17:10-18:00', '18:30-19:20', '19:25-20:15',
		'20:20-21:10'
	];
	
	// 建立基本課表結構
	timeSlots.forEach((time, index) => {
		const row = document.createElement('tr');
		
		// 時間欄
		const timeCell = document.createElement('td');
		timeCell.textContent = `第${index + 1}節\n${time}`;
		timeCell.style.backgroundColor = '#f8f9fa';
		timeCell.style.fontWeight = 'bold';
		timeCell.style.whiteSpace = 'pre-line';
		timeCell.style.textAlign = 'center';
		row.appendChild(timeCell);
		
		// 週一到週日
		for (let day = 1; day <= 7; day++) {
			const dayCell = document.createElement('td');
			dayCell.className = 'schedule-cell';
			dayCell.innerHTML = '<div class="course-slot" style="padding: 8px; text-align: center; color: #999;">-</div>';
			row.appendChild(dayCell);
		}
		
		tbody.appendChild(row);
	});
	
	console.log("課表基本結構建立完成");
	
	// 如果有課程資料，嘗試解析並填入課表
	if (apibackend.course_schedule_data && apibackend.course_schedule_data.course_list) {
		console.log("找到課程資料，開始分析課程時間...");
		
		const courses = apibackend.course_schedule_data.course_list;
		const isPersonal = apibackend.course_schedule_data.is_personal;
		
		// 如果是個人課表，只顯示已選課程
		const coursesToShow = isPersonal ? 
			courses.filter(course => course.is_selected) : 
			courses.slice(0, 50); // 公開資料只顯示前50門課避免過載
		
		console.log(`處理 ${coursesToShow.length} 門課程 (${isPersonal ? '個人課表' : '公開課程'})`);
		
		coursesToShow.forEach(course => {
			if (course.time && course.time !== "無課程資料") {
				console.log(`處理課程: ${course.name}, 時間: ${course.time}`);
				
				// 解析課程時間 (格式類似: "123,145" 代表週一第2,3節，週一第4,5節)
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
									const targetCell = tbody.children[period - 1]?.children[day];
									
									if (targetCell) {
										// 根據是否為個人課表選擇不同的顏色
										const courseColor = isPersonal ? 
											'linear-gradient(135deg, #00b894 0%, #00a085 100%)' : // 綠色系表示個人課程
											'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)'; // 藍色系表示公開課程
										
										const statusIcon = isPersonal ? '✅' : '📚';
										
										targetCell.innerHTML = `
											<div class="course-item" style="
												background: ${courseColor};
												color: white;
												padding: 6px;
												border-radius: 4px;
												font-size: 11px;
												line-height: 1.2;
												font-weight: 500;
												cursor: pointer;
												box-shadow: 0 2px 4px rgba(0,0,0,0.1);
											">
												<div style="font-weight: bold;">${statusIcon} ${course.name.substring(0, 8)}${course.name.length > 8 ? '...' : ''}</div>
												<div style="font-size: 9px; opacity: 0.9;">${course.teacher_name || '未知教師'}</div>
												<div style="font-size: 9px; opacity: 0.8;">${course.room || '未知教室'}</div>
											</div>
										`;
									}
								}
							}
						} catch (error) {
							console.warn(`無法解析時間資訊: ${timeSlot}`, error);
						}
					}
				});
			}
		});
		
		console.log("課程資料填入完成");
	} else {
		console.log("沒有課程資料，顯示空白課表");
	}
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
