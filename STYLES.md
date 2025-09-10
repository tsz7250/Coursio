# WannaClass Styles Architecture

## Overview
This project uses a unified SCSS architecture to manage all styles in a single, maintainable system. All component styles are compiled into a single CSS file to avoid conflicts and improve performance.

## File Structure

```
renderer/scss/
├── wannaclass.scss          # Main SCSS file that imports all others
├── _variables.scss          # Global variables and settings
├── _color-variables.scss    # Color system and theme variables
├── _normalize.scss          # CSS reset and normalization
├── _typography.scss         # Font styles and text formatting
├── _global.scss            # Global base styles
├── _login-page.scss        # Login page specific styles
├── _content-page.scss      # Content page specific styles
├── _sidebar.scss           # Sidebar navigation styles
├── _hover.scss             # Interactive hover effects
├── _tabs.scss              # Tab component styles (formerly tabs.css)
├── _simple-scrollbar.scss  # Custom scrollbar styles (formerly simple-scrollbar.css)
├── _modal.scss             # Modal component styles (formerly MHModal.css)
└── materializecss/         # Third-party Materialize components
    ├── _modal.scss
    └── _tapTarget.scss
```

## Build Process

### Development
```bash
npm run watch:css    # Watch for changes and auto-compile
```

### Production
```bash
npm run build:css    # Compile SCSS to compressed CSS
```

## Key Improvements

### 1. Unified Architecture
- All styles now managed in one place
- Clear separation of concerns with modular SCSS files
- Consistent variable system across all components

### 2. Better Maintainability
- Component-based organization
- Shared variables prevent inconsistencies
- Easy to find and modify specific styles

### 3. Performance Optimization
- Single CSS file reduces HTTP requests
- Compressed output for production
- Source maps for debugging

### 4. Conflict Prevention
- Namespaced components prevent style conflicts
- Proper cascade hierarchy
- Clear dependency management

## Component Guidelines

### Adding New Components
1. Create a new SCSS file with underscore prefix (e.g., `_new-component.scss`)
2. Add variables at the top of the file
3. Use BEM methodology for CSS classes
4. Import the file in `wannaclass.scss`
5. Run build process to compile

### Variable Usage
- Use existing color variables from `_color-variables.scss`
- Add component-specific variables at the top of component files
- Follow naming convention: `$component-property-modifier`

### Example Component Structure
```scss
// Component Variables
$component-primary: $primary-color;
$component-spacing: 1rem;
$component-transition: 0.3s ease;

// Component Styles
.component-name {
  color: $component-primary;
  margin: $component-spacing;
  transition: all $component-transition;
  
  &__element {
    // Element styles
  }
  
  &--modifier {
    // Modifier styles
  }
  
  &:hover {
    // Interactive states
  }
}
```

## Migration Notes

The following files have been integrated into the SCSS architecture:
- `tabs.css` → `_tabs.scss`
- `simple-scrollbar.css` → `_simple-scrollbar.scss` 
- `MHModal.css` → `_modal.scss`

The HTML now loads only one compiled CSS file instead of multiple separate files, improving performance and reducing potential conflicts.

## Development Workflow

1. Make changes to SCSS files
2. Run `npm run watch:css` for development
3. Test changes in the application
4. Run `npm run build:css` for production build
5. Commit both SCSS source and compiled CSS

## Troubleshooting

### Common Issues
- **Compilation errors**: Check SCSS syntax and import paths
- **Missing styles**: Ensure component is imported in `wannaclass.scss`
- **Variable conflicts**: Check variable scope and naming

### Development Tips
- Use browser dev tools with source maps to debug
- Keep component files focused and small
- Test across different screen sizes
- Validate compiled CSS output