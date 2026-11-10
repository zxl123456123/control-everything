import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { PreviewApp } from './entry'

createRoot(document.getElementById('root')).render(createElement(PreviewApp))
