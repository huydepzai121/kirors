import { useState, useEffect } from 'react'
import { KeyRound } from 'lucide-react'
import { storage } from '@/lib/storage'
import { useLocale } from '@/lib/locale'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LanguageSelector } from '@/components/language-selector'

interface LoginPageProps {
  onLogin: (apiKey: string) => void
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [apiKey, setApiKey] = useState('')
  const { t } = useLocale()

  useEffect(() => {
    // 从 storage 读取保存的 API Key
    const savedKey = storage.getApiKey()
    if (savedKey) {
      setApiKey(savedKey)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (apiKey.trim()) {
      storage.setApiKey(apiKey.trim())
      onLogin(apiKey.trim())
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-end">
              <LanguageSelector compact />
            </div>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>
          <CardTitle className="text-2xl">{t('appTitle')}</CardTitle>
          <CardDescription>
            {t('loginDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <Input
                  type="password"
                  placeholder={t('loginApiKeyPlaceholder')}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="text-center"
                />
              </div>
            <Button type="submit" className="w-full" disabled={!apiKey.trim()}>
              {t('signIn')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
