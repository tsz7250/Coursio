function extractCourseIdFromText(text) {
    const match = String(text || '').match(/([A-Z]{2,3}\d{3,4})/);
    return match ? match[1] : 'UNKNOWN';
}

function extractCourseNameFromText(text) {
    const parts = String(text || '').split(/\s+/);
    for (let i = 0; i < parts.length; i++) {
        if (parts[i].match(/[A-Z]{2,3}\d{3,4}/) && i + 1 < parts.length) {
            return parts[i + 1] || '未知課程';
        }
    }
    return parts[0] || '未知課程';
}

function extractRoomFromText(text) {
    const match = String(text || '').match(/([A-Z]?\d{4}[A-Z]?)/);
    return match ? match[1] : '未知教室';
}

function extractTimeFromText(text) {
    const timeMatches = [];
    const textStr = String(text || '');

    const periodMatch = textStr.match(/第\s*(\d+)\s*節/g);
    if (periodMatch && Array.isArray(periodMatch)) {
        periodMatch.forEach(match => {
            const periodNum = match.match(/\d+/);
            if (periodNum && periodNum[0]) timeMatches.push(`第${periodNum[0]}節`);
        });
    }

    const timeRangeMatch = textStr.match(/\d{1,2}:\d{2}\s*[-~]\s*\d{1,2}:\d{2}/g);
    if (timeRangeMatch && Array.isArray(timeRangeMatch)) {
        timeMatches.push(...timeRangeMatch);
    }

    return timeMatches.length > 0 ? timeMatches.join(', ') : '時間待確認';
}

function extractDayFromText(text) {
    const dayMapping = {
        '週一': 1, '周一': 1, '一': 1, 'Mon': 1, 'Monday': 1,
        '週二': 2, '周二': 2, '二': 2, 'Tue': 2, 'Tuesday': 2,
        '週三': 3, '周三': 3, '三': 3, 'Wed': 3, 'Wednesday': 3,
        '週四': 4, '周四': 4, '四': 4, 'Thu': 4, 'Thursday': 4,
        '週五': 5, '周五': 5, '五': 5, 'Fri': 5, 'Friday': 5,
        '週六': 6, '周六': 6, '六': 6, 'Sat': 6, 'Saturday': 6,
        '週日': 7, '周日': 7, '日': 7, '天': 7, 'Sun': 7, 'Sunday': 7
    };

    const days = [];
    for (const [dayStr, dayNum] of Object.entries(dayMapping)) {
        if (String(text || '').includes(dayStr)) days.push(dayNum);
    }

    return days.length > 0 ? days : [];
}

function extractPeriodFromText(text) {
    const periods = [];
    const periodMatches = String(text || '').match(/第\s*(\d+)\s*節/g);

    if (periodMatches) {
        periodMatches.forEach(match => {
            const periodNum = parseInt(match.match(/\d+/)[0]);
            if (periodNum >= 1 && periodNum <= 13) periods.push(periodNum);
        });
    }

    return periods;
}

function extractCreditFromText(text) {
    const match = String(text || '').match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : 0;
}

function parseCourseInfoFromCell(cellText, cellHTML, timeInfo, dayIndex, processTeacherName) {
    try {
        const lines = String(cellText || '').split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length < 2) return null;

        let courseId = 'UNKNOWN';
        let courseName = '未知課程';
        let room = '未知教室';
        let credit = 0;
        let teacher = '未知教師';

        const firstLine = lines[0];
        const codeMatch = firstLine.match(/([A-Z]{2,3}\d{3,4})/);
        const creditMatch = firstLine.match(/\((\d+)\)/);

        if (codeMatch) courseId = codeMatch[1];
        if (creditMatch) credit = parseInt(creditMatch[1]);
        if (lines[1]) courseName = lines[1];
        if (lines[2]) room = lines[2];
        if (lines[3]) teacher = lines[3];

        const periodMatch = String(timeInfo || '').match(/第\s*(\d+)\s*節/);
        const period = periodMatch ? parseInt(periodMatch[1]) : null;

        return {
            course_id: courseId,
            name: courseName,
            teacher_name: processTeacherName(teacher),
            room,
            time: timeInfo,
            day: dayIndex,
            period,
            dept_name: '個人課程',
            credit,
            is_selected: true,
            source: 'Table1 HTML解析',
            raw_text: cellText,
            raw_html: cellHTML
        };
    } catch {
        return null;
    }
}

module.exports = {
    parseCourseInfoFromCell,
    extractCourseIdFromText,
    extractCourseNameFromText,
    extractRoomFromText,
    extractTimeFromText,
    extractDayFromText,
    extractPeriodFromText,
    extractCreditFromText
};
