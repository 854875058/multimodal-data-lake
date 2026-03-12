import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  ElAlert,
  ElAside,
  ElButton,
  ElCol,
  ElContainer,
  ElDialog,
  ElEmpty,
  ElIcon,
  ElInput,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElPagination,
  ElProgress,
  ElRow,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
  ElUpload,
  ElLoading
} from 'element-plus'

import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/aside/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/col/style/css'
import 'element-plus/es/components/container/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/empty/style/css'
import 'element-plus/es/components/icon/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/main/style/css'
import 'element-plus/es/components/menu/style/css'
import 'element-plus/es/components/menu-item/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/pagination/style/css'
import 'element-plus/es/components/progress/style/css'
import 'element-plus/es/components/row/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/table-column/style/css'
import 'element-plus/es/components/tag/style/css'
import 'element-plus/es/components/upload/style/css'
import 'element-plus/es/components/loading/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'

import App from './App.vue'
import router from './router'
import './assets/styles.css'

const app = createApp(App)
const pinia = createPinia()

const components = [
  ElAlert,
  ElAside,
  ElButton,
  ElCol,
  ElContainer,
  ElDialog,
  ElEmpty,
  ElIcon,
  ElInput,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElPagination,
  ElProgress,
  ElRow,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
  ElUpload
]

components.forEach((component) => {
  app.component(component.name, component)
})

app.use(pinia)
app.use(router)
app.directive('loading', ElLoading.directive)

app.mount('#app')
