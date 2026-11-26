import AppKit
import SwiftUI

struct DownloadQueueView: View {
    @Bindable var store: AppStore
    @State private var selected: Set<UUID> = []
    @State private var deleting = false
    @State private var confirmDelete = false
    @State private var deletionError: String?

    private var selectedIDs: Set<UUID> {
        selected.intersection(Set(store.downloads.items.map(\.id)))
    }

    private func removeSelected(deleteFiles: Bool) {
        let ids = selectedIDs
        deleting = true
        Task {
            let errors = await store.downloads.remove(ids, deleteFiles: deleteFiles)
            selected.subtract(ids)
            if !errors.isEmpty { deletionError = errors.joined(separator: "\n") }
            deleting = false
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("下载队列")
                    .font(.headline)
                Spacer()
                Text("进行中 \(store.downloads.activeCount) · 排队 \(store.downloads.queuedCount)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 8)

            HStack(spacing: 8) {
                Toggle("全选下载队列", isOn: Binding(
                    get: { !store.downloads.items.isEmpty && selectedIDs.count == store.downloads.items.count },
                    set: { selected = $0 ? Set(store.downloads.items.map(\.id)) : [] }
                ))
                .labelsHidden()
                .disabled(store.downloads.items.isEmpty || deleting)

                Button("清除已完成") {
                    store.downloads.clearFinished()
                }
                .buttonStyle(QuietButtonStyle())
                .disabled(deleting || store.downloads.items.allSatisfy { !$0.status.isFinished })

                Button("全部取消") {
                    store.downloads.cancelAll()
                }
                .buttonStyle(QuietButtonStyle())
                .disabled(deleting || store.downloads.items.isEmpty)

                Button("删除队列") { removeSelected(deleteFiles: false) }
                    .buttonStyle(QuietButtonStyle())
                    .disabled(selectedIDs.isEmpty || deleting)
                Button("彻底删除队列") { confirmDelete = true }
                    .buttonStyle(QuietButtonStyle())
                    .disabled(selectedIDs.isEmpty || deleting)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.bottom, 4)

            HStack {
                Spacer()
                Button("打开目录") {
                    try? FileManager.default.createDirectory(at: store.saveDirectory, withIntermediateDirectories: true)
                    NSWorkspace.shared.open(store.saveDirectory)
                }
                .buttonStyle(QuietButtonStyle())
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 10)

            Divider().opacity(0.3)

            if store.downloads.items.isEmpty {
                CuteEmptyState(
                    title: "暂无任务",
                    systemImage: "arrow.down.circle",
                    message: "勾选左侧文件，就可以开始下载啦"
                )
            } else {
                List(store.downloads.items) { item in
                    HStack(alignment: .top, spacing: 8) {
                        Toggle("选择 \(item.fileName)", isOn: Binding(
                            get: { selected.contains(item.id) },
                            set: { if $0 { selected.insert(item.id) } else { selected.remove(item.id) } }
                        ))
                        .labelsHidden()
                        .disabled(deleting)
                        DownloadRowView(item: item, saveRoot: store.saveDirectory) {
                        store.downloads.retry(item, saveRoot: store.saveDirectory)
                    } onCancel: {
                        store.downloads.cancel(item)
                        }
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                    .listRowSeparatorTint(Theme.hairline)
                    .listRowBackground(Color.clear)
                }
                .disabled(deleting)
                .listStyle(.inset)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Theme.blush.opacity(0.55))
        .alert("彻底删除队列？", isPresented: $confirmDelete) {
            Button("取消", role: .cancel) { }
            Button("彻底删除", role: .destructive) { removeSelected(deleteFiles: true) }
        } message: {
            Text("将删除选中的 \(selectedIDs.count) 个队列及其本地文件。")
        }
        .alert("删除文件失败", isPresented: Binding(
            get: { deletionError != nil }, set: { if !$0 { deletionError = nil } }
        )) {
            Button("好", role: .cancel) { deletionError = nil }
        } message: {
            Text(deletionError ?? "")
        }
    }
}

struct DownloadRowView: View {
    let item: DownloadItem
    let saveRoot: URL
    let onRetry: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                IconWell(systemName: statusIconName, color: statusColor, size: 26)
                Text(item.fileName)
                    .lineLimit(1)
                    .font(.body.weight(.medium))
                Spacer()
                Text(statusLabel)
                    .font(.caption)
                    .foregroundStyle(statusColor)
            }
            if !item.relativePath.isEmpty {
                Text(item.relativePath)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
                    .padding(.leading, 34)
            }
            if item.status == .downloading || item.status == .resolving {
                BlossomProgress(value: item.progress)
                HStack {
                    Text("\(PathUtil.formatBytes(item.receivedBytes)) / \(PathUtil.formatBytes(max(item.totalBytes, item.expectedSize)))")
                    Spacer()
                    if item.bytesPerSecond > 0 {
                        Text("\(PathUtil.formatBytes(Int64(item.bytesPerSecond)))/s")
                    }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            } else if item.status == .partial {
                BlossomProgress(value: item.progress)
                if let message = item.errorMessage {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(Theme.warning)
                        .lineLimit(2)
                }
            } else if item.status == .failed, let message = item.errorMessage {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(Theme.danger)
                    .lineLimit(2)
            }

            HStack {
                if item.status == .failed || item.status == .cancelled || item.status.canPlay {
                    Button(item.status == .partial ? "继续下载" : (item.status.canPlay ? "重新下载" : "重试"), action: onRetry)
                }
                if item.status == .downloading || item.status == .queued || item.status == .resolving {
                    Button("取消", role: .destructive, action: onCancel)
                }
                if item.status.canPlay, let url = item.localURL {
                    Button("播放") {
                        NSWorkspace.shared.open(url)
                    }
                    Button("在 Finder 中显示") {
                        NSWorkspace.shared.activateFileViewerSelecting([url])
                    }
                }
                Spacer()
            }
            .buttonStyle(.borderless)
            .foregroundStyle(Theme.rose)
            .controlSize(.small)
        }
        .padding(.vertical, 2)
    }

    private var statusIconName: String {
        switch item.status {
        case .queued: return "clock"
        case .resolving: return "link"
        case .downloading: return "arrow.down.circle.fill"
        case .completed: return "checkmark.circle.fill"
        case .partial: return "play.circle.fill"
        case .failed: return "exclamationmark.triangle.fill"
        case .cancelled: return "xmark.circle"
        }
    }

    private var statusColor: Color {
        switch item.status {
        case .queued: return Theme.file
        case .resolving: return Theme.rose
        case .downloading: return Theme.rose
        case .completed: return Theme.success
        case .partial: return Theme.warning
        case .failed: return Theme.danger
        case .cancelled: return .secondary
        }
    }

    private var statusLabel: String {
        switch item.status {
        case .queued: return "排队"
        case .resolving: return "解析地址"
        case .downloading: return "下载中"
        case .completed: return "完成"
        case .partial: return "可播放"
        case .failed: return "失败"
        case .cancelled: return "已取消"
        }
    }
}
