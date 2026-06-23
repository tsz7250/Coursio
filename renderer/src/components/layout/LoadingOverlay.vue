<template>
  <transition name="fade">
    <div v-show="Store.globalLoading" class="loading-overlay">
      <div class="loading-content">
        <div class="bounce-spinner">
          <div class="bounce1"></div>
          <div class="bounce2"></div>
          <div class="bounce3"></div>
        </div>
        <p v-if="Store.globalLoadingText" class="loading-text">{{ Store.globalLoadingText }}</p>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { Store } from '@/store.js';
</script>

<style scoped lang="scss">
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 999;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

// ponytail: 三點彈跳動畫
.bounce-spinner {
  display: flex;
  gap: 8px;

  div {
    width: 12px;
    height: 12px;
    background-color: #0891B2;
    border-radius: 50%;
    display: inline-block;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .bounce1 {
    animation-delay: -0.32s;
  }

  .bounce2 {
    animation-delay: -0.16s;
  }
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1.0);
  }
}

.loading-text {
  color: #164E63;
  font-size: 14px;
  font-weight: 500;
  margin: 0;
  letter-spacing: 0.5px;
}

// Fade 漸變
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
