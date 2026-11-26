import { useState, type JSX } from 'react'
import {
  AlertTriangle,
  ArrowDownCircle,
  CheckCircle2,
  Clock,
  PanelRightClose,
  PanelRightOpen,
  Link2,
  PlayCircle,
  XCircle
} from 'lucide-react'
import { formatBytes } from '../../../shared/format'
import {
  isVideo,
  statusCanPlay,
  statusIsFinished,
  type AppState,
  type DownloadItemDTO,
  type DownloadStatus
} from '../../../shared/types'
import { BlossomProgress, CuteEmptyState, QuietButton } from './widgets'

const statusMeta: Record<
  DownloadStatus,
  { label: string; color: string; icon: JSX.Element }
> = {
  queued: { label: '排队', color: 'text-file', icon: <Clock className="size-3" /> },
  resolving: { label: '解析地址', color: 'text-rose', icon: <Link2 className="size-3" /> },
  downloading: {
    label: '下载中',
    color: 'text-rose',
    icon: <ArrowDownCircle className="size-3 fill-current" />
  },
  completed: {
    label: '完成',
    color: 'text-success',
    icon: <CheckCircle2 className="size-3 fill-current" />
  },
  partial: {
    label: '可播放',
    color: 'text-warning',
    icon: <PlayCircle className="size-3 fill-current" />
  },
  failed: {
    label: '失败',
    color: 'text-danger',
    icon: <AlertTriangle className="size-3 fill-current" />
  },
  cancelled: { label: '已取消', color: 'text-muted', icon: <XCircle className="size-3" /> }
}

function DownloadRow({ item, selected, onSelect }: { item: DownloadItemDTO; selected: boolean; onSelect: () => void }): JSX.Element {
  const meta = statusMeta[item.status]
  const progress = Math.min(1, item.receivedBytes / Math.max(item.totalBytes, 1))
  const busy = item.status === 'downloading' || item.status === 'resolving'
  const canRetry =
    item.status === 'failed' || item.status === 'cancelled' || statusCanPlay(item.status)
  const canCancel = item.status === 'downloading' || item.status === 'queued' || item.status === 'resolving'

  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2">
        <input type="checkbox" aria-label={`选择 ${item.fileName}`} checked={selected} onChange={onSelect} />
        <div
          className={`flex size-[26px] shrink-0 items-center justify-center rounded-full ${meta.color}`}
          style={{ backgroundColor: 'color-mix(in srgb, currentColor 16%, transparent)' }}
        >
          {meta.icon}
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.fileName}</p>
        <span className={`text-xs ${meta.color}`}>{meta.label}</span>
      </div>
      {item.relativePath ? (
        <p className="mt-0.5 truncate pl-[34px] text-[11px] text-muted/70">{item.relativePath}</p>
      ) : null}
      {busy && (
        <div className="mt-1.5 pl-[34px]">
          <BlossomProgress value={progress} />
          <div className="mt-1 flex text-[11px] text-muted">
            <span>
              {formatBytes(item.receivedBytes)} / {formatBytes(Math.max(item.totalBytes, item.expectedSize))}
            </span>
            <span className="ml-auto">
              {item.bytesPerSecond > 0 ? `${formatBytes(item.bytesPerSecond)}/s` : ''}
            </span>
          </div>
        </div>
      )}
      {item.status === 'partial' && (
        <div className="mt-1.5 pl-[34px]">
          <BlossomProgress value={progress} />
          {item.errorMessage && <p className="mt-1 text-xs text-warning">{item.errorMessage}</p>}
        </div>
      )}
      {item.status === 'failed' && item.errorMessage && (
        <p className="mt-1 pl-[34px] text-xs text-danger">{item.errorMessage}</p>
      )}
      <div className="mt-1 flex flex-wrap gap-3 pl-[34px] text-xs text-rose">
        {canRetry && (
          <button type="button" onClick={() => void window.huangguo.retry(item.id)}>
            {item.status === 'partial' ? '继续下载' : statusCanPlay(item.status) ? '重新下载' : '重试'}
          </button>
        )}
        {canCancel && (
          <button type="button" className="text-danger" onClick={() => void window.huangguo.cancel(item.id)}>
            取消
          </button>
        )}
        {statusCanPlay(item.status) && item.localPath && (
          <>
            <button type="button" onClick={() => void window.huangguo.openPath(item.localPath!)}>
              播放
            </button>
            <button type="button" onClick={() => void window.huangguo.showInFolder(item.localPath!)}>
              打开所在文件夹
            </button>
          </>
        )}
        <button type="button" className="text-danger" onClick={() => void window.huangguo.remove(item.id)}>
          删除
        </button>
        <button type="button" onClick={() => void window.huangguo.locateDownload(item.fileId)}>
          来源
        </button>
        {isVideo({ name: item.fileName }) && (
          <button type="button" onClick={() => void window.huangguo.openWatchPage(item.fileId)}>
            网页
          </button>
        )}
      </div>
    </li>
  )
}

export function DownloadQueue({ state }: { state: AppState }): JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const selectedIds = state.downloads.filter((item) => selected.has(item.id)).map((item) => item.id)
  const allSelected = state.downloads.length > 0 && selectedIds.length === state.downloads.length
  const toggleItem = (id: string): void => setSelected((previous) => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const removeSelected = async (deleteFiles: boolean): Promise<void> => {
    if (deleteFiles && !window.confirm(`确定彻底删除选中的 ${selectedIds.length} 个队列及其本地文件吗？`)) return
    setDeleting(true)
    try {
      await window.huangguo.removeDownloads(selectedIds, deleteFiles)
      setSelected(new Set())
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error))
    } finally {
      setDeleting(false)
    }
  }
  const noneFinished = state.downloads.every((item) => !statusIsFinished(item.status))
  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-3 border-l border-hairline py-3" style={{ background: 'var(--queue)' }}>
        <button
          type="button"
          aria-label="展开下载队列"
          aria-expanded={false}
          title="展开下载队列"
          className="rounded-lg p-2 text-rose-deep hover:bg-rose/15"
          onClick={() => setCollapsed(false)}
        >
          <PanelRightOpen className="size-4" />
        </button>
        <span className="text-xs font-medium [writing-mode:vertical-rl]">下载队列</span>
        <span className="text-xs text-rose-deep" title={`进行中 ${state.activeCount} · 排队 ${state.queuedCount}`}>
          {state.activeCount + state.queuedCount}
        </span>
      </aside>
    )
  }
  return (
    <aside className="flex w-[400px] min-w-[320px] shrink-0 flex-col" style={{ background: 'var(--queue)' }}>
      <div className="flex items-center px-3.5 pb-2 pt-3">
        <h2 className="text-[15px] font-semibold">下载队列</h2>
        <button
          type="button"
          aria-label="收起下载队列"
          aria-expanded={true}
          title="收起下载队列"
          className="ml-1 rounded-lg p-1.5 text-rose-deep hover:bg-rose/15"
          onClick={() => setCollapsed(true)}
        >
          <PanelRightClose className="size-4" />
        </button>
        <span className="ml-auto text-xs text-muted">
          进行中 {state.activeCount} · 排队 {state.queuedCount}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-start gap-2 px-3.5 pb-2.5">
        <input type="checkbox" aria-label="全选下载队列" checked={allSelected}
          ref={(element) => { if (element) element.indeterminate = selectedIds.length > 0 && !allSelected }}
          disabled={state.downloads.length === 0 || deleting}
          onChange={() => setSelected(allSelected ? new Set() : new Set(state.downloads.map((item) => item.id)))} />
        <QuietButton disabled={noneFinished || deleting} onClick={() => void window.huangguo.clearFinished()}>
          清除已完成
        </QuietButton>
        <QuietButton disabled={state.downloads.length === 0 || deleting} onClick={() => void window.huangguo.cancelAll()}>
          全部取消
        </QuietButton>
        <QuietButton disabled={selectedIds.length === 0 || deleting} onClick={() => void removeSelected(false)}>
          删除队列
        </QuietButton>
        <QuietButton disabled={selectedIds.length === 0 || deleting} onClick={() => void removeSelected(true)}>
          彻底删除队列
        </QuietButton>
        <QuietButton onClick={() => void window.huangguo.openSaveDirectory()}>打开目录</QuietButton>
      </div>
      <div className="h-px bg-hairline/80" />
      {state.downloads.length === 0 ? (
        <CuteEmptyState
          title="暂无任务"
          icon={<ArrowDownCircle className="size-7" />}
          message="勾选左侧文件，就可以开始下载啦"
        />
      ) : (
        <ul className={`min-h-0 flex-1 overflow-auto ${deleting ? "pointer-events-none opacity-60" : ""}`} aria-busy={deleting}>
          {state.downloads.map((item) => (
            <DownloadRow key={item.id} item={item} selected={selected.has(item.id)} onSelect={() => toggleItem(item.id)} />
          ))}
        </ul>
      )}
    </aside>
  )
}
