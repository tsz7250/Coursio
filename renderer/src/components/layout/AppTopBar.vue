<template>
  <div class="top-bar">
    <span class="top-bar-title" :class="{ 'top-bar-title-lg': titleLarge }">{{ title }}</span>
    <div class="top-bar-right">
      <i data-lucide="bell" class="icon-topbar-bell"></i>
      <div
        v-if="isLoggedIn"
        class="user-chip"
        @click.stop="toggleMenu"
      >
        <i data-lucide="user"></i>
        <span>{{ sid || '' }}</span>
        <div class="user-menu" v-show="showUserMenu">
          <div
            v-if="showSettingsAction"
            class="user-menu-item"
            @click.stop="$emit('settings')"
          >
            <i data-lucide="settings" class="icon-menu-sm"></i> 設定帳號
          </div>
          <div
            v-if="showLogoutAction"
            class="user-menu-item user-menu-item-danger"
            @click.stop="$emit('logout')"
          >
            <i data-lucide="log-out" class="icon-menu-sm"></i> 登出
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  title: { type: String, required: true },
  titleLarge: { type: Boolean, default: false },
  isLoggedIn: { type: Boolean, default: false },
  sid: { type: String, default: '' },
  showUserMenu: { type: Boolean, default: false },
  showSettingsAction: { type: Boolean, default: true },
  showLogoutAction: { type: Boolean, default: true }
});

const emit = defineEmits(['update:showUserMenu', 'settings', 'logout']);

function toggleMenu() {
  emit('update:showUserMenu', !props.showUserMenu);
}
</script>
