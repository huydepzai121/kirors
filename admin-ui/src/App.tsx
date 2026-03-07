import { useState, useEffect } from 'react'
import { storage } from '@/lib/storage'
import { LocaleProvider, type AdminLocale } from '@/lib/locale'
import { LoginPage } from '@/components/login-page'
import { Dashboard } from '@/components/dashboard'
import { Toaster } from '@/components/ui/sonner'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [locale, setLocale] = useState<AdminLocale>(() => storage.getLocale())

  useEffect(() => {
    // 检查是否已经有保存的 API Key
    if (storage.getApiKey()) {
      setIsLoggedIn(true)
    }
  }, [])

  const handleLogin = () => {
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
  }

  const handleLocaleChange = (nextLocale: AdminLocale) => {
    setLocale(nextLocale)
    storage.setLocale(nextLocale)
  }

  return (
    <LocaleProvider locale={locale} setLocale={handleLocaleChange}>
      {isLoggedIn ? (
        <Dashboard onLogout={handleLogout} />
      ) : (
        <LoginPage onLogin={handleLogin} />
      )}
      <Toaster position="top-right" />
    </LocaleProvider>
  )
}

export default App
