import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Theme } from '@radix-ui/themes'
import App from './App'
import '@radix-ui/themes/styles.css'
import './styles/tokens.css'
import './App.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Theme accentColor="blue" grayColor="gray" panelBackground="solid" radius="large" scaling="100%">
      <App />
    </Theme>
  </StrictMode>,
)
