# Coursio Styles Architecture

## Overview
This project uses a modern frontend architecture powered by **Vite**, **Vue 3**, and a hybrid styling system combining **SCSS** and **Tailwind CSS v4**. 

- **SCSS**: Used for core component logic, complex animations, and legacy integration.
- **Tailwind CSS**: Used for rapid UI construction, layout utilities, and consistent spacing/colors via its theme system.
- **Lucide Icons**: A tree-shakeable icon set integrated into the Vue application.

## File Structure (SCSS)

All primary styles are located in `renderer/scss/` and follow the **ITCSS (Inverted Triangle CSS)** architecture to manage specificity and scope.

```
renderer/scss/
├── coursio.scss             # Main entry (imports all layers in order)
├── 1-settings/              # Variables and feature toggles
│   ├── _color-variables.scss
│   └── _variables.scss
├── 2-tools/                 # Mixins and functions
├── 3-generic/               # Reset and normalization
│   ├── _normalize.scss
│   ├── _typography.scss
│   └── vendor/              # Third-party vendor styles
│       └── materializecss/
├── 4-elements/              # Global base HTML styles
│   └── _global.scss
├── 5-objects/               # Unstyled layout structures
├── 6-components/            # Shared components and Design System
│   ├── _ds-components.scss  # Core UI components (Buttons, Inputs, Cards, Toasts)
│   ├── _tabs.scss
│   ├── _modal.scss
│   ├── _simple-scrollbar.scss
│   └── _hover.scss
└── 7-utilities/             # Helper classes (last layer)
```

## Styling Technologies

### 1. Tailwind CSS v4
The project uses Tailwind CSS for utility-first styling. The configuration and theme are defined in `renderer/css/tailwind.css`.
- **Theme Variables**: Custom colors like `primary`, `success`, `danger`, and `warning` are available as Tailwind classes (e.g., `text-primary`, `bg-success`).
- **Standard**: Prefer Tailwind for internal spacing, layout, and rapid prototyping within components.

### 2. SCSS Design System
The `6-components/_ds-components.scss` file contains high-level, reusable components (Buttons, Badges, Cards) that follow the project's design language.

### 3. Vue Scoped Styles (PRIMARY)
For page-specific or component-specific styles, **ALWAYS** use `<style scoped lang="scss">` within the `.vue` file.
- **Why**: This prevents global style leakage and specificity conflicts (the "need for !important" problem).
- **Organization**: Move styles from global SCSS files into component scopes as you refactor.

## Development Guidelines

### Adding New Styles
1. **Component Scoping**: If the style is only for one page/component, use `<style scoped>` in the `.vue` file.
2. **Shared Components**: If the style is a reusable UI element, add it to `renderer/scss/6-components/`.
3. **ITCSS Layering**: Ensure new global files are imported in `coursio.scss` within the correct ITCSS layer.
4. **No !important**: Avoid `!important`. If you need it, your specificity is likely too high or you are fighting a global style that should be scoped.

### BEM & Naming
When writing SCSS (even inside scoped styles), follow the BEM (Block Element Modifier) methodology.

```scss
/* Scoped style inside a Vue component */
.about-feature {
  &__card {
    display: flex;
    &--highlighted { border-color: var(--color-primary); }
  }
}
```

