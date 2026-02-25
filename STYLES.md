# Coursio Styles Architecture

## Overview
This project uses a modern frontend architecture powered by **Vite**, **Vue 3**, and a hybrid styling system combining **SCSS** and **Tailwind CSS v4**. 

- **SCSS**: Used for core component logic, complex animations, and legacy integration.
- **Tailwind CSS**: Used for rapid UI construction, layout utilities, and consistent spacing/colors via its theme system.
- **Lucide Icons**: A tree-shakeable icon set integrated into the Vue application.

## File Structure (SCSS)

All primary styles are located in `renderer/scss/` and are bundled by Vite.

```
renderer/scss/
├── coursio.scss             # Main entry (imports all modules)
├── _variables.scss          # Global SCSS variables
├── _color-variables.scss    # Color system and theme variables
├── _ds-components.scss      # Core Design System components (Buttons, Inputs, etc.)
├── _normalize.scss          # CSS reset and normalization
├── _typography.scss         # Font styles and text formatting
├── _global.scss            # Global base styles
├── _login-page.scss        # Login page specific styles
├── _content-page.scss      # Content page specific styles
├── _sidebar.scss           # Sidebar navigation styles
├── _schedule.scss          # Schedule table and time-table styles
├── _tabs.scss              # Tab component styles
├── _modal.scss             # Modal component styles
├── _about-modal.scss       # About dialog specific styles
├── _components.scss        # General UI components
├── _hover.scss             # Interactive hover effects
├── _simple-scrollbar.scss  # Custom scrollbar styles
└── materializecss/         # Materialize component overrides
    ├── _modal.scss
    └── _tapTarget.scss
```

## Styling Technologies

### 1. Tailwind CSS v4
The project uses Tailwind CSS for utility-first styling. The configuration and theme are defined in `renderer/css/tailwind.css`.
- **Theme Variables**: Custom colors like `primary`, `success`, `danger`, and `warning` are available as Tailwind classes (e.g., `text-primary`, `bg-success`).
- **Integration**: Imported in `renderer/main.js`.

### 2. SCSS Design System
The `_ds-components.scss` file contains high-level, reusable component styles that follow a consistent design language. This is where most complex UI elements are defined.

### 3. Lucide Icons
Icons are imported selectively to minimize bundle size. Usage can be found in `renderer/main.js`.

## Build Process

The styling build process is fully integrated into Vite. You no longer need separate watch scripts for CSS.

### Development
```bash
npm run dev         # Starts development environment with HMR
```

### Production Build
```bash
npm run build:renderer   # Compiles and minifies all assets via Vite
```

## Development Guidelines

### Adding New Styles
1. **Utility-first**: Prefer Tailwind CSS classes for layout, spacing, and simple styling.
2. **Components**: For complex, reusable components, create a new SCSS file (e.g., `_my-component.scss`).
3. **Registration**: Import new SCSS files in `renderer/scss/coursio.scss`.
4. **Icons**: Add new Lucide icons to the import list in `renderer/main.js` if they are not already available.

### BEM & Naming
When writing SCSS, follow the BEM (Block Element Modifier) methodology for clarity and to prevent nesting issues.

```scss
.wc-card {
  @apply shadow-sm rounded-lg; // Mix with Tailwind utilities
  
  &__header {
    margin-bottom: $spacing-md;
  }
  
  &--featured {
    border-color: var(--color-primary);
  }
}
```

## Migration Notes
The project has moved from a legacy standalone SCSS build to a unified Vite pipeline. Key changes:
- `tabs.css`, `simple-scrollbar.css`, and `MHModal.css` are now integrated as SCSS modules.
- Tailwind CSS is now the primary tool for layout and rapid prototyping.
- Vue components (`.vue` files) can use `<style scoped lang="scss">` for component-specific isolation.