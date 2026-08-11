import SwiftUI
import AppKit

@main
struct AIXinjiMacApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .frame(minWidth: 1120, minHeight: 760)
                .task { await state.bootstrap() }
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        ZStack {
            AppBackground()
            if state.isSignedIn {
                TimelineWorkspace()
            } else {
                LoginView()
            }
        }
        .preferredColorScheme(.dark)
        .background(WindowConfigurator())
    }
}

struct WindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            window.isMovableByWindowBackground = true
            window.titleVisibility = .hidden
            window.titlebarAppearsTransparent = true
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

struct AppBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.03, green: 0.03, blue: 0.06),
                    Color(red: 0.08, green: 0.06, blue: 0.12),
                    Color(red: 0.03, green: 0.05, blue: 0.07)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            RadialGradient(colors: [.purple.opacity(0.16), .clear], center: .topLeading, startRadius: 80, endRadius: 620)
            RadialGradient(colors: [.cyan.opacity(0.10), .clear], center: .bottomTrailing, startRadius: 120, endRadius: 700)
        }
        .ignoresSafeArea()
    }
}

struct LoginView: View {
    @EnvironmentObject private var state: AppState
    @State private var showPassword = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 18) {
                AppMark(size: 58)
                VStack(spacing: 4) {
                    Text("AI 信迹")
                        .font(.system(size: 32, weight: .bold))
                    Text("原生 Mac 客户端 · 0.03")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 12) {
                    TextField("邮箱地址", text: $state.email)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 14)
                        .frame(height: 44)
                        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.10)))

                    HStack(spacing: 8) {
                        Group {
                            if showPassword {
                                TextField("密码", text: $state.password)
                            } else {
                                SecureField("密码", text: $state.password)
                            }
                        }
                        .textFieldStyle(.plain)

                        Button {
                            showPassword.toggle()
                        } label: {
                            Image(systemName: showPassword ? "eye.slash" : "eye")
                                .frame(width: 24, height: 24)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                        .help(showPassword ? "隐藏密码" : "显示密码")
                    }
                    .padding(.horizontal, 14)
                    .frame(height: 44)
                    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.10)))
                }
                .frame(width: 360)

                Button {
                    Task { await state.signIn() }
                } label: {
                    HStack {
                        if state.isLoading { ProgressView().controlSize(.small) }
                        Text(state.isLoading ? "登录中..." : "登录")
                    }
                    .frame(width: 360, height: 44)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .keyboardShortcut(.defaultAction)
                .disabled(state.isLoading)

                if !state.message.isEmpty {
                    Text(state.message)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .frame(width: 420)
                }
            }
            .padding(34)
            .background(.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(.white.opacity(0.10)))
            .shadow(color: .black.opacity(0.25), radius: 30, y: 20)
            Spacer()
        }
    }
}

struct TimelineWorkspace: View {
    @EnvironmentObject private var state: AppState

    var filteredFiles: [FileTimelineItem] {
        let q = state.searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let scoped = state.files.filter { file in
            switch state.currentSection {
            case .timeline:
                return true
            case .favorites:
                return state.favoriteRecordIds.contains(file.recordId)
            case .sources:
                return !file.recordSourceLabel.isEmpty || !file.recordTitle.isEmpty
            case .todos:
                return file.hasTodo
            }
        }
        guard !q.isEmpty else { return scoped }
        return scoped.filter { $0.searchHaystack.localizedCaseInsensitiveContains(q) }
    }

    var dayGroups: [TimelineDayGroup] {
        Dictionary(grouping: filteredFiles, by: \.dayKey)
            .map { TimelineDayGroup(key: $0.key, title: $0.value.first?.dayTitle ?? "未知日期", files: $0.value) }
            .sorted { lhs, rhs in
                (lhs.files.first?.createdDate ?? .distantPast) > (rhs.files.first?.createdDate ?? .distantPast)
            }
    }

    var selectedFile: FileTimelineItem? {
        if let selected = state.selectedFile, filteredFiles.contains(where: { $0.id == selected.id }) {
            return selected
        }
        return filteredFiles.first
    }

    var body: some View {
        HStack(spacing: 0) {
            SidebarView()

            VStack(spacing: 0) {
                HeaderView(total: state.files.count, filtered: filteredFiles.count)

                HStack(spacing: 0) {
                    TimelineColumn(groups: dayGroups)
                        .frame(minWidth: 420, idealWidth: 460)

                    Divider().overlay(.white.opacity(0.08))

                    if let file = selectedFile {
                        FileDetailView(file: file)
                            .id(file.id)
                    } else {
                        EmptyTimelineView(searching: !state.searchText.isEmpty)
                    }
                }
            }
        }
        .overlay(alignment: .top) {
            DragStrip()
        }
        .onChange(of: filteredFiles.map(\.id)) { _, ids in
            if let current = state.selectedFileId, ids.contains(current) { return }
            state.selectedFileId = ids.first
        }
    }
}

struct DragStrip: View {
    var body: some View {
        WindowDragView()
            .frame(height: 28)
    }
}

struct WindowDragView: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        DraggingNSView()
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

final class DraggingNSView: NSView {
    override func mouseDown(with event: NSEvent) {
        window?.performDrag(with: event)
    }
}

struct TimelineDayGroup: Identifiable {
    let key: String
    let title: String
    let files: [FileTimelineItem]

    var id: String { key }
}

struct SidebarView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 6) {
                Text("AI 信迹")
                    .font(.system(size: 27, weight: .bold))
                Text("知识收件箱")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 8) {
                SidebarButton(title: AppSection.timeline.title, systemImage: AppSection.timeline.systemImage, active: state.currentSection == .timeline) {
                    state.currentSection = .timeline
                }
                SidebarButton(title: "网页录入", systemImage: "plus.circle", active: false) {
                    state.openWebCapture()
                }
                SidebarButton(title: AppSection.favorites.title, systemImage: AppSection.favorites.systemImage, badge: state.favoriteRecordIds.count, active: state.currentSection == .favorites) {
                    state.currentSection = .favorites
                }
                SidebarButton(title: AppSection.sources.title, systemImage: AppSection.sources.systemImage, active: state.currentSection == .sources) {
                    state.currentSection = .sources
                }
                SidebarButton(title: AppSection.todos.title, systemImage: AppSection.todos.systemImage, badge: state.files.filter(\.hasTodo).count, active: state.currentSection == .todos) {
                    state.currentSection = .todos
                }
                SidebarButton(title: "刷新同步", systemImage: "arrow.clockwise", active: false) {
                    Task { await state.loadTimeline() }
                }
            }

            Spacer()

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Circle()
                        .fill(LinearGradient(colors: [.purple, .cyan], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 36, height: 36)
                        .overlay(Text(String(state.email.prefix(1)).uppercased()).font(.headline))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(state.email)
                            .font(.footnote.weight(.semibold))
                            .lineLimit(1)
                        Text("已登录")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Button("退出登录") { state.signOut() }
                    .buttonStyle(.plain)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(14)
            .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.08)))
        }
        .padding(24)
        .frame(width: 260)
        .background(.black.opacity(0.34))
    }
}

struct SidebarButton: View {
    let title: String
    let systemImage: String
    var badge: Int = 0
    let active: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Label(title, systemImage: systemImage)
                    .font(.system(size: 15, weight: active ? .semibold : .regular))
                Spacer()
                if badge > 0 {
                    Text("\(badge)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.pink)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(active ? .white.opacity(0.11) : .clear, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .foregroundStyle(active ? .primary : .secondary)
    }
}

struct HeaderView: View {
    @EnvironmentObject private var state: AppState
    let total: Int
    let filtered: Int

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(state.currentSection.title)
                    .font(.title2.bold())
                Text(state.searchText.isEmpty ? "\(total) 个文件" : "\(filtered) / \(total) 个文件")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("搜索文件、标签、OCR、摘要", text: $state.searchText)
                    .textFieldStyle(.plain)
                if !state.searchText.isEmpty {
                    Button {
                        state.searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 12)
            .frame(width: 360, height: 40)
            .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 13))
            .overlay(RoundedRectangle(cornerRadius: 13).stroke(.white.opacity(0.08)))

            if state.isLoading {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 18)
        .background(.black.opacity(0.20))
        .overlay(alignment: .bottom) { Rectangle().fill(.white.opacity(0.08)).frame(height: 1) }
    }
}

struct TimelineColumn: View {
    @EnvironmentObject private var state: AppState
    let groups: [TimelineDayGroup]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                if groups.isEmpty {
                    EmptyListHint(searching: !state.searchText.isEmpty)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 120)
                } else {
                    ForEach(groups) { group in
                        TimelineDaySection(group: group)
                    }
                }
            }
            .padding(22)
        }
        .background(.white.opacity(0.035))
    }
}

struct TimelineDaySection: View {
    let group: TimelineDayGroup

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Text(group.title)
                    .font(.headline)
                Text("\(group.files.count) 个文件")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.white.opacity(0.06), in: Capsule())
            }

            VStack(alignment: .leading, spacing: 10) {
                ForEach(group.files) { file in
                    TimelineFileCard(file: file)
                }
            }
        }
    }
}

struct TimelineFileCard: View {
    @EnvironmentObject private var state: AppState
    let file: FileTimelineItem

    var isSelected: Bool { state.selectedFileId == file.id }
    var isFavorite: Bool { state.favoriteRecordIds.contains(file.recordId) }

    var body: some View {
        Button {
            state.selectedFileId = file.id
            Task { await state.loadPreview(for: file) }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(spacing: 0) {
                    Circle()
                        .fill(isSelected ? Color.accentColor : .white.opacity(0.22))
                        .frame(width: 10, height: 10)
                    Rectangle()
                        .fill(.white.opacity(0.10))
                        .frame(width: 1)
                        .frame(maxHeight: .infinity)
                }
                .frame(width: 12)

                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        FileBadge(mimeType: file.mimeType)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 8) {
                                Text(file.originalName)
                                    .font(.headline)
                                    .lineLimit(1)
                                if isFavorite {
                                    Image(systemName: "star.fill")
                                        .font(.caption)
                                        .foregroundStyle(.yellow)
                                }
                            }
                            Text("\(file.kindLabel) · \(file.byteSizeText) · \(file.timeText)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }

                    Text(file.bestDescription)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    HStack(spacing: 8) {
                        Text(file.recordSourceLabel.isEmpty ? "手动收件箱" : file.recordSourceLabel)
                            .lineLimit(1)
                        Spacer()
                        ForEach(Array(file.allTags.prefix(2)), id: \.self) { tag in
                            Text("#\(tag)")
                                .lineLimit(1)
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                .padding(14)
                .background(isSelected ? .white.opacity(0.105) : .white.opacity(0.045), in: RoundedRectangle(cornerRadius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(isSelected ? Color.accentColor.opacity(0.45) : .white.opacity(0.07), lineWidth: 1)
                )
            }
        }
        .buttonStyle(.plain)
    }
}

struct FileDetailView: View {
    @EnvironmentObject private var state: AppState
    let file: FileTimelineItem

    var isFavorite: Bool { state.favoriteRecordIds.contains(file.recordId) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 7) {
                    Text(file.kindLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(file.originalName)
                            .font(.title2.bold())
                            .lineLimit(2)
                        if isFavorite {
                            Image(systemName: "star.fill")
                                .foregroundStyle(.yellow)
                        }
                    }
                    Text("\(file.byteSizeText) · \(file.createdAt.shortDateTime)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                PreviewCard(file: file)

                HStack(spacing: 10) {
                    Button {
                        Task { await state.toggleFavorite(file) }
                    } label: {
                        Label(isFavorite ? "已收藏" : "收藏", systemImage: isFavorite ? "star.fill" : "star")
                    }
                    .buttonStyle(.bordered)

                    Button {
                        Task { await state.openAsset(file) }
                    } label: {
                        Label("打开文件", systemImage: "arrow.up.right.square")
                    }
                    .buttonStyle(.borderedProminent)

                    Button {
                        Task { await state.downloadAsset(file) }
                    } label: {
                        Label("下载到本地", systemImage: "arrow.down.circle")
                    }
                    .buttonStyle(.bordered)

                    Button {
                        state.copyShareLink(file)
                    } label: {
                        Label("复制链接", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.bordered)

                    if !state.message.isEmpty {
                        Text(state.message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                DetailCard(title: "AI 摘要") {
                    Text(file.recordSummary.isEmpty ? file.bestDescription : file.recordSummary)
                }

                DetailCard(title: "来源与描述") {
                    VStack(alignment: .leading, spacing: 8) {
                        LabeledContent("来源", value: file.recordSourceLabel.isEmpty ? "手动收件箱" : file.recordSourceLabel)
                        LabeledContent("记录", value: file.recordTitle)
                        Text(file.bestDescription)
                    }
                }

                if !file.allTags.isEmpty {
                    DetailCard(title: "自动标签") {
                        FlowTags(tags: file.allTags)
                    }
                }

                if !file.analysisText.isEmpty {
                    DetailCard(title: file.mimeType.hasPrefix("image/") ? "OCR 识别" : "文档抽取 / 解析") {
                        Text(file.analysisText)
                            .font(.system(.footnote, design: .monospaced))
                            .textSelection(.enabled)
                    }
                }
            }
            .padding(28)
        }
        .background(.white.opacity(0.02))
        .task(id: file.id) {
            await state.loadPreview(for: file)
        }
    }
}

struct PreviewCard: View {
    @EnvironmentObject private var state: AppState
    let file: FileTimelineItem

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18)
                .fill(.white.opacity(0.045))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.08)))

            if file.mimeType.hasPrefix("image/"), let image = state.previewImages[file.id] {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFit()
                    .padding(12)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
            } else if state.previewLoadingIds.contains(file.id) {
                VStack(spacing: 10) {
                    ProgressView()
                    Text("正在加载预览")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else {
                VStack(spacing: 10) {
                    FileBadge(mimeType: file.mimeType, size: 56)
                    Text(file.mimeType.hasPrefix("image/") ? "未能加载图片预览，可直接打开文件" : "当前文件可打开或下载查看")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(minHeight: 300)
    }
}

struct DetailCard<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            content
                .font(.body)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.07)))
    }
}

struct EmptyTimelineView: View {
    let searching: Bool

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: searching ? "magnifyingglass" : "tray")
                .font(.system(size: 36))
                .foregroundStyle(.secondary)
            Text(searching ? "没有匹配结果" : "暂无资料")
                .font(.headline)
            Text(searching ? "换个关键词再试试。" : "在网页端录入后会自动同步到这里。")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct EmptyListHint: View {
    let searching: Bool

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: searching ? "magnifyingglass" : "tray")
                .font(.system(size: 26))
                .foregroundStyle(.secondary)
            Text(searching ? "没有找到资料" : "还没有资料")
                .font(.headline)
            Text(searching ? "搜索范围包含文件名、标签、OCR 和摘要。" : "点击左侧网页录入，新增后刷新即可同步。")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

struct FileBadge: View {
    let mimeType: String
    var size: CGFloat = 34

    var body: some View {
        Text(label)
            .font(.system(size: size > 40 ? 13 : 10, weight: .bold))
            .frame(width: size, height: size)
            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(.white.opacity(0.10)))
            .foregroundStyle(.secondary)
    }

    var label: String {
        if mimeType.hasPrefix("image/") { return "IMG" }
        if mimeType == "application/pdf" { return "PDF" }
        if mimeType.hasPrefix("video/") { return "VID" }
        if mimeType.hasPrefix("audio/") { return "AUD" }
        if mimeType.localizedCaseInsensitiveContains("sheet") { return "XLS" }
        if mimeType.localizedCaseInsensitiveContains("word") { return "DOC" }
        return "FILE"
    }
}

struct FlowTags: View {
    let tags: [String]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(tags, id: \.self) { tag in
                Text("#\(tag)")
                    .font(.caption)
                    .lineLimit(1)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }
}

struct AppMark: View {
    let size: CGFloat

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.28)
            .fill(LinearGradient(colors: [.purple, .blue, .cyan], startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: size, height: size)
            .overlay(Text("✦").font(.system(size: size * 0.42, weight: .bold)).foregroundStyle(.white))
    }
}
