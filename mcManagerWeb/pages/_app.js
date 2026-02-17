import '../styles/globals.css'
import { useEffect } from 'react'
import { io } from 'socket.io-client'
import { ConfigProvider } from '../lib/config-context'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Inizializza Socket.IO
    fetch('/api/socket')
  }, [])

  return (
    <ConfigProvider>
      <Component {...pageProps} />
    </ConfigProvider>
  )
}
