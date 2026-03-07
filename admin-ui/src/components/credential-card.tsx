import { useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, ChevronUp, ChevronDown, Wallet, Trash2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useLocale } from '@/lib/locale'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CredentialStatusItem, BalanceResponse } from '@/types/api'
import {
  useSetDisabled,
  useSetPriority,
  useResetFailure,
  useDeleteCredential,
} from '@/hooks/use-credentials'

interface CredentialCardProps {
  credential: CredentialStatusItem
  onViewBalance: (id: number) => void
  selected: boolean
  onToggleSelect: () => void
  balance: BalanceResponse | null
  loadingBalance: boolean
}

function formatLastUsed(lastUsedAt: string | null, t: (key: any, params?: Record<string, string | number>) => string): string {
  if (!lastUsedAt) return t('neverUsed')
  const date = new Date(lastUsedAt)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 0) return t('justNow')
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return t('secondsAgo', { count: seconds })
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return t('minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  return t('daysAgo', { count: days })
}

export function CredentialCard({
  credential,
  onViewBalance,
  selected,
  onToggleSelect,
  balance,
  loadingBalance,
}: CredentialCardProps) {
  const { t, formatNumber } = useLocale()
  const [editingPriority, setEditingPriority] = useState(false)
  const [priorityValue, setPriorityValue] = useState(String(credential.priority))
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const setDisabled = useSetDisabled()
  const setPriority = useSetPriority()
  const resetFailure = useResetFailure()
  const deleteCredential = useDeleteCredential()

  const handleToggleDisabled = () => {
    setDisabled.mutate(
      { id: credential.id, disabled: !credential.disabled },
      {
        onSuccess: (res) => {
          toast.success(res.message)
        },
        onError: (err) => {
          toast.error(t('actionFailed', { message: (err as Error).message }))
        },
      }
    )
  }

  const handlePriorityChange = () => {
    const newPriority = parseInt(priorityValue, 10)
    if (isNaN(newPriority) || newPriority < 0) {
      toast.error(t('priorityMustBeNonNegative'))
      return
    }
    setPriority.mutate(
      { id: credential.id, priority: newPriority },
      {
        onSuccess: (res) => {
          toast.success(res.message)
          setEditingPriority(false)
        },
        onError: (err) => {
          toast.error(t('actionFailed', { message: (err as Error).message }))
        },
      }
    )
  }

  const handleReset = () => {
    resetFailure.mutate(credential.id, {
      onSuccess: (res) => {
        toast.success(res.message)
      },
      onError: (err) => {
        toast.error(t('actionFailed', { message: (err as Error).message }))
      },
    })
  }

  const handleDelete = () => {
    if (!credential.disabled) {
      toast.error(t('disableBeforeDelete'))
      setShowDeleteDialog(false)
      return
    }

    deleteCredential.mutate(credential.id, {
      onSuccess: (res) => {
        toast.success(res.message)
        setShowDeleteDialog(false)
      },
      onError: (err) => {
        toast.error(t('deleteFailed', { message: (err as Error).message }))
      },
    })
  }

  return (
    <>
      <Card className={credential.isCurrent ? 'ring-2 ring-primary' : ''}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selected}
                onCheckedChange={onToggleSelect}
              />
              <CardTitle className="text-lg flex items-center gap-2">
                {credential.email || t('credentialId', { id: credential.id })}
                {credential.isCurrent && (
                  <Badge variant="success">{t('active')}</Badge>
                )}
                {credential.disabled && (
                  <Badge variant="destructive">{t('disabled')}</Badge>
                )}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('enabled')}</span>
              <Switch
                checked={!credential.disabled}
                onCheckedChange={handleToggleDisabled}
                disabled={setDisabled.isPending}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 信息网格 */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t('priority')}: </span>
              {editingPriority ? (
                <div className="inline-flex items-center gap-1 ml-1">
                  <Input
                    type="number"
                    value={priorityValue}
                    onChange={(e) => setPriorityValue(e.target.value)}
                    className="w-16 h-7 text-sm"
                    min="0"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={handlePriorityChange}
                    disabled={setPriority.isPending}
                  >
                    ✓
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setEditingPriority(false)
                      setPriorityValue(String(credential.priority))
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <span
                  className="font-medium cursor-pointer hover:underline ml-1"
                  onClick={() => setEditingPriority(true)}
                >
                  {credential.priority}
                  <span className="text-xs text-muted-foreground ml-1">{t('clickToEdit')}</span>
                </span>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">{t('failureCount')}: </span>
              <span className={credential.failureCount > 0 ? 'text-red-500 font-medium' : ''}>
                {credential.failureCount}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('subscriptionTier')}: </span>
              <span className="font-medium">
                {loadingBalance ? (
                  <Loader2 className="inline w-3 h-3 animate-spin" />
                ) : balance?.subscriptionTitle || t('unknown')}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('successCountLabel')}: </span>
              <span className="font-medium">{credential.successCount}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">{t('lastUsed')}: </span>
              <span className="font-medium">{formatLastUsed(credential.lastUsedAt, t)}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">{t('remainingUsage')}: </span>
              {loadingBalance ? (
                <span className="text-sm ml-1">
                  <Loader2 className="inline w-3 h-3 animate-spin" /> {t('loading')}
                </span>
              ) : balance ? (
                <span className="font-medium ml-1">
                  {formatNumber(balance.remaining, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  {' / '}
                  {formatNumber(balance.usageLimit, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="text-xs text-muted-foreground ml-1">
                    {t('remainingPercent', { percent: (100 - balance.usagePercentage).toFixed(1) })}
                  </span>
                </span>
              ) : (
                <span className="text-sm text-muted-foreground ml-1">{t('unknown')}</span>
              )}
            </div>
            {credential.hasProxy && (
              <div className="col-span-2">
                <span className="text-muted-foreground">{t('proxy')}: </span>
                <span className="font-medium">{credential.proxyUrl}</span>
              </div>
            )}
            {credential.hasProfileArn && (
              <div className="col-span-2">
                <Badge variant="secondary">{t('hasProfileArn')}</Badge>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={resetFailure.isPending || credential.failureCount === 0}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {t('resetFailure')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const newPriority = Math.max(0, credential.priority - 1)
                setPriority.mutate(
                  { id: credential.id, priority: newPriority },
                  {
                    onSuccess: (res) => toast.success(res.message),
                    onError: (err) => toast.error(t('actionFailed', { message: (err as Error).message })),
                  }
                )
              }}
              disabled={setPriority.isPending || credential.priority === 0}
            >
              <ChevronUp className="h-4 w-4 mr-1" />
              {t('increasePriority')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const newPriority = credential.priority + 1
                setPriority.mutate(
                  { id: credential.id, priority: newPriority },
                  {
                    onSuccess: (res) => toast.success(res.message),
                    onError: (err) => toast.error(t('actionFailed', { message: (err as Error).message })),
                  }
                )
              }}
              disabled={setPriority.isPending}
            >
              <ChevronDown className="h-4 w-4 mr-1" />
              {t('decreasePriority')}
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => onViewBalance(credential.id)}
            >
              <Wallet className="h-4 w-4 mr-1" />
              {t('viewBalance')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              disabled={!credential.disabled}
              title={!credential.disabled ? t('deleteNeedDisabledHint') : undefined}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t('delete')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteCredentialTitle')}</DialogTitle>
            <DialogDescription>
              {t('deleteCredentialConfirm', { id: credential.id })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteCredential.isPending}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteCredential.isPending || !credential.disabled}
            >
              {t('confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
