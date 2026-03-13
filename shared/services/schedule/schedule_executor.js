async function executeCompleteScheduleFetch(service, year, smtr) {
    const backend = service.backend;
    console.log('🚀 使用改進版 Puppeteer 完全自動化課表獲取...');

    if (!backend.ALLDATA.original_account || !backend.ALLDATA.original_password) {
        console.error('❌ 缺少登入憑證');
        service.setEmptyPersonalSchedule('缺少登入憑證');
        return backend;
    }

    try {
        const result = await backend.puppeteerService.getCompleteScheduleData(year, smtr);
        if (result.success) {
            console.log('✅ 改進版 Puppeteer 課表獲取成功');
            backend.course_schedule_data = {
                course_list: result.data.course_list || [],
                is_personal: true,
                source: '改進版 Puppeteer 課表獲取',
                warning: null,
                message: `成功獲取個人課表 (${result.data.course_list?.length || 0} 門課程)`,
                label1_info: result.data.label1,
                raw_table_html: result.data.table1,
                extraction_time: result.data.extraction_time,
                puppeteer_success: true
            };
            return backend;
        }

        console.error('❌ 改進版 Puppeteer 課表獲取失敗:', result.message);
        service.setEmptyPersonalSchedule(`改進版 Puppeteer 失敗: ${result.message}`);
        return backend;
    } catch (error) {
        if (error.message && error.message.includes('Target closed') && backend.course_schedule_data) {
            console.warn('⚠️ 檢測到清理過程錯誤，但課表數據已成功獲取，忽略此錯誤');
            return backend;
        }

        console.error('❌ 改進版 Puppeteer 課表獲取異常:', error.message);
        service.setEmptyPersonalSchedule(`系統錯誤: ${error.message}`);
        return backend;
    }
}

module.exports = { executeCompleteScheduleFetch };
