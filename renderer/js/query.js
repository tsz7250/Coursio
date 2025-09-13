
// Legacy query functionality - functionality now moved to yzu_backend.js
// This file is kept for compatibility but contains no active code

// All query functions are now implemented in yzu_backend.js:
// - queryCourseByDept()
// - queryCourseByName()  
// - queryCourseByTeacher()
// - queryCourseByTime()




// if(data["type"]=="dept"){
//     courseDB.db.all("SELECT * from courses WHERE year = ? AND smtr = ? AND dept_name = ?", [data["data"]["Year"], data["data"]["Smt"], data["data"]["Dept"], ], (err, table)=>{
//         console.log(table);
//         ipcRenderer.send(CHANNEL_NAME.TELL_MAIN_QUERY_COURSES__COMPLETE, {"result": table})
//     })
// }else if(data["type"]=="courseName"){
//     console.log(data);
//     var cn = "%"+data["data"]["CourseName"]+"%"

//     courseDB.db.all("SELECT * from courses WHERE name LIKE ? AND year = ? AND smtr = ?", [cn, data["data"]["Year"], data["data"]["Smt"]], (err, table)=>{
//         console.log(table);
//         ipcRenderer.send(CHANNEL_NAME.TELL_MAIN_QUERY_COURSES__COMPLETE, {"result": table})
//     })
// }else if(data["type"]=="teacherName"){
//     var tn = "%"+data["data"]["TeacherName"]+"%"

//     courseDB.db.all("SELECT * from courses WHERE teacher_name LIKE ? AND year = ? AND smtr = ?", [tn, data["data"]["Year"], data["data"]["Smt"]], (err, table)=>{
//         console.log(table);
//         ipcRenderer.send(CHANNEL_NAME.TELL_MAIN_QUERY_COURSES__COMPLETE, {"result": table})
//     })
// }else if(data["type"]=="courseTime"){
//     var tn = "%"+data["data"]["time"]+"%"
//     courseDB.db.all("SELECT * from courses WHERE time LIKE ? AND year = ? AND smtr = ?", [tn, data["data"]["Year"], data["data"]["Smt"]], (err, table)=>{
//         console.log(table);
//         ipcRenderer.send(CHANNEL_NAME.TELL_MAIN_QUERY_COURSES__COMPLETE, {"result": table})
//     })
// }
