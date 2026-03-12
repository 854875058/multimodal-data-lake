import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './assets/styles.css'

ReactDOM.createRoot(document.getElementById('app')).render(
  <HashRouter>
    <App />
  </HashRouter>
)
