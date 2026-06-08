# Coursio 樣式架構

## 概述
本專案使用現代前端架構，由 **Vite**、**Vue 3** 以及結合 **SCSS** 與預編譯靜態 **Tailwind CSS v4** 樣式表的混合樣式系統所驅動。 

- **SCSS**：用於核心元件邏輯、全域佈局規則、複雜動畫，以及 MaterializeCSS 舊版元件樣式。
- **Tailwind CSS**：用於快速 UI 構建、工具類別佈局，以及透過預設工具類別提供一致的間距與顏色。
- **Lucide Icons**：整合在 Vue 應用程式中且支援 Tree-shaking（搖樹優化）的圖標集。

## 檔案結構 (SCSS)

所有主要樣式都位於 [renderer/src/assets/scss/](file:///h:/GitFiles/Coursio/renderer/src/assets/scss/)，並遵循 **ITCSS (Inverted Triangle CSS)** 架構來管理特異度（Specificity）與作用域（Scope）。

```
renderer/src/assets/scss/
├── coursio.scss             # 主入口檔案（依序匯入所有圖層）
├── 1-settings/              # 變數與功能開關
│   ├── _color-variables.scss # Material Design 調色盤
│   └── _variables.scss       # Cyan UI.pen 主題變數與文字顏色
├── 2-tools/                 # Mixins 與 Functions（未使用）
├── 3-generic/               # 重設與標準化 (Reset & Normalization)
│   ├── _normalize.scss
│   ├── _typography.scss
│   └── vendor/              # 第三方套件樣式
│       └── materializecss/
├── 4-elements/              # 全域基礎 HTML 樣式
│   └── _global.scss
├── 5-objects/               # 無樣式的佈局結構（未使用）
├── 6-components/            # 共用元件與設計系統 (Design System)
│   ├── _ds-components.scss  # 核心 UI 元件（按鈕、輸入框、卡片、Toast 提示）
│   ├── _tabs.scss
│   ├── _modal.scss          # 彈窗佈局與遮罩層
│   ├── _simple-scrollbar.scss
│   └── _hover.scss          # 微互動動畫
└── 7-utilities/             # 輔助類別（最後一層）
```

## 樣式技術

### 1. Tailwind CSS v4 (靜態樣式表)
專案匯入了位於 [tailwind.css](file:///h:/GitFiles/Coursio/renderer/src/assets/css/tailwind.css) 的預編譯 Tailwind CSS 樣式表。
- **無建置依賴**：專案目前在建置（Build）時不會動態編譯 Tailwind。相反地，該靜態 CSS 檔案提供了標準的 Tailwind 工具類別（例如 `flex`、`grid`、`absolute`、`items-center`）以及自訂的主題變數。
- **主題變數**：自訂設計變數（如 `primary`、`success`、`danger` 和 `warning`）已作為 Tailwind 工具類別提供（例如 `text-primary`、`bg-success`、`border-gray-200`）。
- **標準**：偏好使用 Tailwind 工具類別來處理元素間距、行內 flex 佈局以及快速的元件構建。

### 2. SCSS 設計系統 (UI.pen Cyan 主題)
[_ds-components.scss](file:///h:/GitFiles/Coursio/renderer/src/assets/scss/6-components/_ds-components.scss) 檔案定義了符合 UI.pen 設計規範的可重用核心元件：
- **按鈕 (`.btn`)**：實作了基礎動畫，並提供 `.btn-primary`、`.btn-cyan`、`.btn-success`、`.btn-danger`、`.btn-secondary`、`.btn-ghost` 及 `.btn-outline` 等變體。
- **表單 (`.form-control`, `.form-select`)**：輸入框與選擇器的標準樣式。
- **卡片 (`.card`) 與標籤 (`.badge`)**：配置為遵循一致的圓角 (`var(--radius-lg)`) 與主題陰影。
- **輔助函式**：使用在 [_variables.scss](file:///h:/GitFiles/Coursio/renderer/src/assets/scss/1-settings/_variables.scss) 中定義的 SCSS 輔助函式 `theme-color($key)` 和 `text-color($key)`，從設計標記對照表（Design Token Map）中獲取數值。

### 3. Vue 作用域樣式 (主要方式)
對於特定頁面的佈局與自訂元素，**務必**在 `.vue` 檔案內使用 `<style scoped lang="scss">`。
- **作用域**：防止樣式洩漏至其他區塊，解決 CSS 特異度衝突。
- **目標頁面**：在 [renderer/src/pages/](file:///h:/GitFiles/Coursio/renderer/src/pages/) 中使用作用域樣式的主要頁面包括：
  - `AboutPage.vue`
  - `AutoSelectionPage.vue`
  - `CourseQueryPage.vue`
  - `GradesPage.vue`
  - `MainDashboard.vue`
  - `PreSchedulePage.vue` (新預排課表佈局)
  - `SchedulePage.vue`
  - `SettingsPage.vue`
  - `App.vue` (登入與全域側邊欄佈局)

## 開發指南

### 新增樣式
1. **元件作用域**：若樣式僅適用於單一頁面，請將其放置於 Vue 元件的 `<style scoped lang="scss">` 中。
2. **共用 UI 元件**：跨頁面重用的 UI 元素應結構化於 [6-components/](file:///h:/GitFiles/Coursio/renderer/src/assets/scss/6-components/) 中，並匯入至 [coursio.scss](file:///h:/GitFiles/Coursio/renderer/src/assets/scss/coursio.scss)。
3. **一致的微動畫**：確保懸停互動（定義於 [_hover.scss](file:///h:/GitFiles/Coursio/renderer/src/assets/scss/6-components/_hover.scss) 與元件檔案中）使用平滑的過渡效果（例如 `transition: all 0.2s ease-in-out`）以維持高級感。
4. **避免使用 `!important`**：妥善管理特異度圖層，而不是強制使用 `!important` 覆蓋樣式。

### BEM 與命名
對於 SCSS（包括作用域樣式），請遵循 BEM（Block Element Modifier）命名規範：

```scss
/* Vue 元件內的作用域樣式 */
.about-feature {
  &__card {
    display: flex;
    &--highlighted { 
      border-color: var(--color-primary); 
    }
  }
}
```
