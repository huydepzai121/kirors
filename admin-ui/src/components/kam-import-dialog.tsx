import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCredentials, useAddCredential, useDeleteCredential } from '@/hooks/use-credentials'
import { getCredentialBalance, setCredentialDisabled } from '@/api/credentials'
import { extractErrorMessage, sha256Hex } from '@/lib/utils'
import { useLocale } from '@/lib/locale'

interface KamImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// KAM 导出 JSON 中的账号结构
interface KamAccount {
  email?: string
  userId?: string | null
  nickname?: string
  credentials: {
    refreshToken: string
    clientId?: string
    clientSecret?: string
    region?: string
    authMethod?: string
    startUrl?: string
  }
  machineId?: string
  status?: string
}

interface VerificationResult {
  index: number
  status: 'pending' | 'checking' | 'verifying' | 'verified' | 'duplicate' | 'failed' | 'skipped'
  error?: string
  usage?: string
  email?: string
  credentialId?: number
  rollbackStatus?: 'success' | 'failed' | 'skipped'
  rollbackError?: string
}



// 校验元素是否为有效的 KAM 账号结构
function isValidKamAccount(item: unknown): item is KamAccount {
  if (typeof item !== 'object' || item === null) return false
  const obj = item as Record<string, unknown>
  if (typeof obj.credentials !== 'object' || obj.credentials === null) return false
  const cred = obj.credentials as Record<string, unknown>
  return typeof cred.refreshToken === 'string' && cred.refreshToken.trim().length > 0
}

// 解析 KAM 导出 JSON，支持单账号和多账号格式
function parseKamJson(raw: string): KamAccount[] {
  const parsed = JSON.parse(raw)

  let rawItems: unknown[]

  // 标准 KAM 导出格式：{ version, accounts: [...] }
  if (parsed.accounts && Array.isArray(parsed.accounts)) {
    rawItems = parsed.accounts
  }
  // 兜底：如果直接是账号数组
  else if (Array.isArray(parsed)) {
    rawItems = parsed
  }
  // 单个账号对象（有 credentials 字段）
  else if (parsed.credentials && typeof parsed.credentials === 'object') {
    rawItems = [parsed]
  }
  else {
    throw new Error('Unrecognized KAM JSON format')
  }

  const validAccounts = rawItems.filter(isValidKamAccount)

  if (rawItems.length > 0 && validAccounts.length === 0) {
    throw new Error(`Found ${rawItems.length} records but none has a valid credentials.refreshToken`)
  }

  if (validAccounts.length < rawItems.length) {
    const skipped = rawItems.length - validAccounts.length
    console.warn(`KAM import: skipped ${skipped} records without valid credentials.refreshToken`)
  }

  return validAccounts
}

export function KamImportDialog({ open, onOpenChange }: KamImportDialogProps) {
  const { t } = useLocale()
  const [jsonInput, setJsonInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [skipErrorAccounts, setSkipErrorAccounts] = useState(true)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [currentProcessing, setCurrentProcessing] = useState<string>('')
  const [results, setResults] = useState<VerificationResult[]>([])

  const { data: existingCredentials } = useCredentials()
  const { mutateAsync: addCredential } = useAddCredential()
  const { mutateAsync: deleteCredential } = useDeleteCredential()

  const rollbackCredential = async (id: number): Promise<{ success: boolean; error?: string }> => {
    try {
      await setCredentialDisabled(id, true)
    } catch (error) {
      return { success: false, error: t('rollbackDisableFailed', { message: extractErrorMessage(error) }) }
    }
    try {
      await deleteCredential(id)
      return { success: true }
    } catch (error) {
      return { success: false, error: t('rollbackDeleteFailed', { message: extractErrorMessage(error) }) }
    }
  }

  const resetForm = () => {
    setJsonInput('')
    setProgress({ current: 0, total: 0 })
    setCurrentProcessing('')
    setResults([])
  }

  const handleImport = async () => {
    // 先单独解析 JSON，给出精准的错误提示
    let validAccounts: KamAccount[]
    try {
      const accounts = parseKamJson(jsonInput)

      if (accounts.length === 0) {
        toast.error(t('noAccountToImport'))
        return
      }

      validAccounts = accounts.filter(a => a.credentials?.refreshToken)
      if (validAccounts.length === 0) {
        toast.error(t('noValidTokenAccount'))
        return
      }
    } catch (error) {
      toast.error(t('jsonInvalid', { message: extractErrorMessage(error) }))
      return
    }

    try {

      setImporting(true)
      setProgress({ current: 0, total: validAccounts.length })

      // 初始化结果，标记 error 状态的账号
      const initialResults: VerificationResult[] = validAccounts.map((account, i) => {
        if (skipErrorAccounts && account.status === 'error') {
          return { index: i + 1, status: 'skipped' as const, email: account.email || account.nickname }
        }
        return { index: i + 1, status: 'pending' as const, email: account.email || account.nickname }
      })
      setResults(initialResults)

      // 重复检测
      const existingTokenHashes = new Set(
        existingCredentials?.credentials
          .map(c => c.refreshTokenHash)
          .filter((hash): hash is string => Boolean(hash)) || []
      )

      let successCount = 0
      let duplicateCount = 0
      let failCount = 0
      let skippedCount = 0

      for (let i = 0; i < validAccounts.length; i++) {
        const account = validAccounts[i]

        // 跳过 error 状态的账号
        if (skipErrorAccounts && account.status === 'error') {
          skippedCount++
          setProgress({ current: i + 1, total: validAccounts.length })
          continue
        }

        const cred = account.credentials
        const token = cred.refreshToken.trim()
        const tokenHash = await sha256Hex(token)

        setCurrentProcessing(t('processingAccount', { name: account.email || account.nickname || t('accountIndex', { index: i + 1 }) }))
        setResults(prev => {
          const next = [...prev]
          next[i] = { ...next[i], status: 'checking' }
          return next
        })

        // 检查重复
        if (existingTokenHashes.has(tokenHash)) {
          duplicateCount++
          const existingCred = existingCredentials?.credentials.find(c => c.refreshTokenHash === tokenHash)
          setResults(prev => {
            const next = [...prev]
            next[i] = { ...next[i], status: 'duplicate', error: t('credentialExists'), email: existingCred?.email || account.email }
            return next
          })
          setProgress({ current: i + 1, total: validAccounts.length })
          continue
        }

        // 验活中
        setResults(prev => {
          const next = [...prev]
          next[i] = { ...next[i], status: 'verifying' }
          return next
        })

        let addedCredId: number | null = null

        try {
          const clientId = cred.clientId?.trim() || undefined
          const clientSecret = cred.clientSecret?.trim() || undefined
          const authMethod = clientId && clientSecret ? 'idc' : 'social'

          // idc 模式下必须同时提供 clientId 和 clientSecret
          if (authMethod === 'social' && (clientId || clientSecret)) {
            throw new Error('idc mode requires both clientId and clientSecret')
          }

          const addedCred = await addCredential({
            refreshToken: token,
            authMethod,
            authRegion: cred.region?.trim() || undefined,
            clientId,
            clientSecret,
            machineId: account.machineId?.trim() || undefined,
          })

          addedCredId = addedCred.credentialId

          await new Promise(resolve => setTimeout(resolve, 1000))

          const balance = await getCredentialBalance(addedCred.credentialId)

          successCount++
          existingTokenHashes.add(tokenHash)
          setCurrentProcessing(t('verifySuccessWithName', {
            name: addedCred.email || account.email || t('accountIndex', { index: i + 1 }),
          }))
          setResults(prev => {
            const next = [...prev]
            next[i] = {
              ...next[i],
              status: 'verified',
              usage: `${balance.currentUsage}/${balance.usageLimit}`,
              email: addedCred.email || account.email,
              credentialId: addedCred.credentialId,
            }
            return next
          })
        } catch (error) {
          let rollbackStatus: VerificationResult['rollbackStatus'] = 'skipped'
          let rollbackError: string | undefined

          if (addedCredId) {
            const result = await rollbackCredential(addedCredId)
            if (result.success) {
              rollbackStatus = 'success'
            } else {
              rollbackStatus = 'failed'
              rollbackError = result.error
            }
          }

          failCount++
          setResults(prev => {
            const next = [...prev]
            next[i] = {
              ...next[i],
              status: 'failed',
              error: extractErrorMessage(error),
              rollbackStatus,
              rollbackError,
            }
            return next
          })
        }

        setProgress({ current: i + 1, total: validAccounts.length })
      }

      // 汇总
      const parts: string[] = []
      if (successCount > 0) parts.push(`${t('success')} ${successCount}`)
      if (duplicateCount > 0) parts.push(`${t('duplicate')} ${duplicateCount}`)
      if (failCount > 0) parts.push(`${t('failed')} ${failCount}`)
      if (skippedCount > 0) parts.push(`${t('skipped')} ${skippedCount}`)

      if (failCount === 0 && duplicateCount === 0 && skippedCount === 0) {
        toast.success(t('importAndVerifySuccess', { count: successCount }))
      } else {
        toast.info(t('importSummary', { summary: parts.join(', ') }))
      }
    } catch (error) {
      toast.error(t('importFailed', { message: extractErrorMessage(error) }))
    } finally {
      setImporting(false)
    }
  }

  const getStatusIcon = (status: VerificationResult['status']) => {
    switch (status) {
      case 'pending':
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
      case 'checking':
      case 'verifying':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      case 'verified':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'duplicate':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      case 'skipped':
        return <AlertCircle className="w-5 h-5 text-gray-400" />
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />
    }
  }

  const getStatusText = (result: VerificationResult) => {
    switch (result.status) {
      case 'pending': return t('waiting')
      case 'checking': return t('checkingDuplicate')
      case 'verifying': return t('verifyingShort')
      case 'verified': return t('verified')
      case 'duplicate': return t('duplicate')
      case 'skipped': return t('skippedErrorStatus')
      case 'failed':
        if (result.rollbackStatus === 'success') return t('verifyFailedExcluded')
        if (result.rollbackStatus === 'failed') return t('verifyFailedNotExcluded')
        return t('verifyFailedNotCreated')
    }
  }

  // 预览解析结果
  const { previewAccounts, parseError } = useMemo(() => {
    if (!jsonInput.trim()) return { previewAccounts: [] as KamAccount[], parseError: '' }
    try {
      return { previewAccounts: parseKamJson(jsonInput), parseError: '' }
    } catch (e) {
      return { previewAccounts: [] as KamAccount[], parseError: extractErrorMessage(e) }
    }
  }, [jsonInput])

  const errorAccountCount = previewAccounts.filter(a => a.status === 'error').length

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen && importing) return
        if (!newOpen) resetForm()
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('kamImportTitle')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('kamJsonLabel')}</label>
            <textarea
              placeholder={t('kamJsonPlaceholder')}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              disabled={importing}
              className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
            />
          </div>

          {/* 解析预览 */}
          {parseError && (
            <div className="text-sm text-red-600 dark:text-red-400">{t('parseFailed', { message: parseError })}</div>
          )}
          {previewAccounts.length > 0 && !importing && results.length === 0 && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">
                {errorAccountCount > 0
                  ? t('detectedAccountsWithError', { count: previewAccounts.length, errorCount: errorAccountCount })
                  : t('detectedAccounts', { count: previewAccounts.length })}
              </div>
              {errorAccountCount > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={skipErrorAccounts}
                    onChange={(e) => setSkipErrorAccounts(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  {t('skipErrorAccounts')}
                </label>
              )}
            </div>
          )}

          {/* 导入进度和结果 */}
          {(importing || results.length > 0) && (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{importing ? t('importProgress') : t('importCompleted')}</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                  />
                </div>
                {importing && currentProcessing && (
                  <div className="text-xs text-muted-foreground">{currentProcessing}</div>
                )}
              </div>

              <div className="flex gap-4 text-sm">
                <span className="text-green-600 dark:text-green-400">
                  {t('success')}: {results.filter(r => r.status === 'verified').length}
                </span>
                <span className="text-yellow-600 dark:text-yellow-400">
                  {t('duplicate')}: {results.filter(r => r.status === 'duplicate').length}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  {t('failed')}: {results.filter(r => r.status === 'failed').length}
                </span>
                <span className="text-gray-500">
                  {t('skipped')}: {results.filter(r => r.status === 'skipped').length}
                </span>
              </div>

              <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
                {results.map((result) => (
                  <div key={result.index} className="p-3">
                    <div className="flex items-start gap-3">
                      {getStatusIcon(result.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {result.email || t('accountIndex', { index: result.index })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {getStatusText(result)}
                          </span>
                        </div>
                        {result.usage && (
                          <div className="text-xs text-muted-foreground mt-1">{t('usage', { value: result.usage })}</div>
                        )}
                        {result.error && (
                          <div className="text-xs text-red-600 dark:text-red-400 mt-1">{result.error}</div>
                        )}
                        {result.rollbackError && (
                          <div className="text-xs text-red-600 dark:text-red-400 mt-1">{t('rollbackFailed', { message: result.rollbackError })}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => { onOpenChange(false); resetForm() }}
            disabled={importing}
          >
            {importing ? t('importInProgress') : results.length > 0 ? t('close') : t('cancel')}
          </Button>
          {results.length === 0 && (
            <Button
              type="button"
              onClick={handleImport}
              disabled={importing || !jsonInput.trim() || previewAccounts.length === 0 || !!parseError}
            >
              {t('startImport')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
