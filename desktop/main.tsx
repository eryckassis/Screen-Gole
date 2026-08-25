import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DesktopApp } from './desktop-app'
import '@fontsource-variable/manrope'
import './styles.css'

const root = document.getElementById('root')

if (!root) throw new Error('Elemento raiz do aplicativo não encontrado')

createRoot(root).render(
  <StrictMode>
    <DesktopApp />
  </StrictMode>,
)
