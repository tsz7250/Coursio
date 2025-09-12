{
    // 確保在 DOMContentLoaded 後再操作 DOM，避免對 null 進行 appendChild
    const initYearOptions = function() {
        var start = new Date().getFullYear() - 1911;

        ["#querySelectQueryYear",
        "#querySelectQueryYear_forCourseName",
        "#querySelectQueryYear_forTeacherName",
        "#querySelectQueryYear_forQueryTime"].forEach((selector)=>{
            const target = document.querySelector(selector);
            if (!target) {
                // 元素尚未出現，略過此 selector
                return;
            }

            for (var i in [...Array(5).keys()]) {
                var option = document.createElement("option")
                option.value = `${start - 1 + parseInt(i)}`;
                option.textContent = `${start - 1 + parseInt(i)}`;
                target.appendChild(option)
            }
        })
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initYearOptions, { once: true });
    } else {
        initYearOptions();
    }
}