var currentSectionId = "";

function hideAllSection(){
    document.querySelectorAll(".inner-section").forEach((element)=>{
        element.classList.remove("is-shown");
    })

    document.querySelectorAll(".sidebar-item").forEach((element)=>{
        element.classList.remove("active")
    })
    
    console.log("所有區段已隱藏");
}

function showSectionById(section) {
    hideAllSection()
    
    // 更新側邊欄項目狀態
    const sidebarItem = document.querySelector(`#${section}-sidebar-item`);
    if (sidebarItem) {
        sidebarItem.classList.add("active");
    }
    
    // 首先嘗試找到組件內的元素（動態載入後）
    let targetElement = document.getElementById(`section-${section}`);
    
    // 如果找不到，嘗試容器元素
    if (!targetElement) {
        switch(section) {
            case 'Main':
                targetElement = document.getElementById('main-dashboard-container');
                break;
            case 'Schedule':
                targetElement = document.getElementById('schedule-container');
                break;
            case 'School-timetable-Query':
                targetElement = document.getElementById('course-query-container');
                break;
            case 'Auto-Selection':
                targetElement = document.getElementById('auto-selection-container');
                break;
            case 'Task-List':
                targetElement = document.getElementById('task-list-container');
                break;
            case 'Settings':
                targetElement = document.getElementById('settings-container');
                break;
        }
    }
    
    if (targetElement) {
        targetElement.classList.add('is-shown');
        currentSectionId = section;
        console.log(`顯示區段: ${section}`);
    } else {
        console.error(`無法找到區段元素: ${section}`);
    }
}
