const path = require('path');
const builder = require('electron-builder');

const isMac = process.platform === 'darwin';

builder.build({

    projectDir: path.resolve(__dirname),  // 專案路徑 

    win: isMac ? undefined : ['zip'],  // zip
    mac: isMac ? ['zip'] : undefined,
    config: {
        "appId": "com.tsz7250.coursio",
        "productName": "Coursio", // 應用程式名稱 ( 顯示在應用程式與功能 )
        // "copyright": "Copyright © year ${author} "
        "directories": {
            "output": isMac ? "build/mac" : "build/win"
        },
        "win": {
            "icon": path.resolve(__dirname, 'icon-512x512.png'),
        },
        "mac": {
            "icon": path.resolve(__dirname, 'icon-512x512.png'),
            "target": ["zip"]
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