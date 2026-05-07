import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ConfigProvider } from '@arco-design/web-react'
import zhCN from '@arco-design/web-react/es/locale/zh-CN'
import '@arco-design/web-react/dist/css/arco.css'
import App from './App.jsx'
import './assets/styles.css'
import './assets/arco-overrides.css'
import './assets/prd-style.css'

ReactDOM.createRoot(document.getElementById('app')).render(
  <HashRouter>
    <ConfigProvider locale={zhCN}>
      <App />
    </ConfigProvider>
  </HashRouter>
)
