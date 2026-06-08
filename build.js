const path = require('path');
const builder = require('electron-builder');

builder.build({

    projectDir: path.resolve(__dirname),  // 專案路徑 

    win: ['nsis', 'portable'],  // nsis . portable
    config: {
        "appId": "com.tsz7250.coursio",
        "productName": "Coursio", // 應用程式名稱 ( 顯示在應用程式與功能 )
        // "copyright": "Copyright © year ${author} "
        "directories": {
            "output": "build/win"
        },
        "win": {
            "icon": path.resolve(__dirname, 'icon-512x512.png'),
        },
        "extraResources": [
            {
                "from": "resources/yzuCourseBot",
                "to": "yzuCourseBot",
                "filter": [
                    "**/*",
                    "!__pycache__"
                ]
            }
        ],
        "buildDependenciesFromSource": false,
        "nodeGypRebuild": false,
        "npmRebuild": false
    },
})
    .then(
        data => console.log(data),
        err => console.error(err)
    );