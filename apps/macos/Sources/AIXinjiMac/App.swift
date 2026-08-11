import SwiftUI
import AppKit

@main
struct AIXinjiMacApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .frame(minWidth: 1080, minHeight: 720)
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
            LinearGradient(
                colors: [Color(red: 0.05, green: 0.05, blue: 0.08), Color(red: 0.08, green: 0.06, blue: 0.12)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            if state.isSignedIn {
                TimelineWorkspace()
            } else {
                LoginView()
            }
        }
        .preferredColorScheme(.dark)
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
                    Text("原生 Mac 客户端 · 0.1")
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
                                .frame(width: 22)
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
        let q = state.searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return state.files }
        return state.files.filter { file in
            file.searchHaystack.localizedCaseInsensitiveContains(q)
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
                    List(filteredFiles, selection: $state.selectedFileId) { file in
                        FileRow(file: file)
                            .tag(file.id)
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                    .frame(minWidth: 360, idealWidth: 420)
                    .background(.white.opacity(0.035))

                    Divider().overlay(.white.opacity(0.08))

                    if let file = selectedFile {
                        FileDetailView(file: file)
                            .id(file.id)
                    } else {
                        EmptyTimelineView()
                    }
                }
            }
        }
        .onChange(of: filteredFiles.map(\.id)) { _, ids in
            if let current = state.selectedFileId, ids.contains(current) { return }
            state.selectedFileId = ids.first
        }
    }
}

struct SidebarView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 6) {
                Text("AI 信迹")
                    .font(.system(size: 25, weight: .bold))
                Text("知识收件箱")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 8) {
                SidebarButton(title: "时间线", systemImage: "doc.text", active: true) {
                    Task { await state.loadTimeline() }
                }
                SidebarButton(title: "刷新", systemImage: "arrow.clockwise", active: false) {
                    Task { await state.loadTimeline() }
                }
            }

            Spacer()

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    Circle()
                        .fill(LinearGradient(colors: [.purple, .cyan], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 34, height: 34)
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
        .frame(width: 250)
        .background(.black.opacity(0.28))
    }
}

struct SidebarButton: View {
    let title: String
    let systemImage: String
    let active: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.system(size: 15, weight: active ? .semibold : .regular))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(active ? .white.opacity(0.10) : .clear, in: RoundedRectangle(cornerRadius: 14))
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
                Text("时间线")
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
            .frame(width: 320, height: 38)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.08)))

            if state.isLoading {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 18)
        .background(.black.opacity(0.18))
        .overlay(alignment: .bottom) { Rectangle().fill(.white.opacity(0.08)).frame(height: 1) }
    }
}

struct FileRow: View {
    let file: FileTimelineItem

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                FileBadge(mimeType: file.mimeType)
                VStack(alignment: .leading, spacing: 3) {
                    Text(file.originalName)
                        .font(.headline)
                        .lineLimit(1)
                    Text("\(file.kindLabel) · \(file.byteSizeText)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            Text(file.bestDescription)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)

            HStack {
                Text(file.recordSourceLabel.isEmpty ? "手动收件箱" : file.recordSourceLabel)
                Spacer()
                Text(file.createdAt.shortDateTime)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(14)
        .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.06)))
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
    }
}

struct FileDetailView: View {
    @EnvironmentObject private var state: AppState
    let file: FileTimelineItem

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(file.kindLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(file.originalName)
                        .font(.title2.bold())
                    Text("\(file.byteSizeText) · \(file.createdAt.shortDateTime)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                PreviewCard(file: file)

                HStack {
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

                    if !state.message.isEmpty {
                        Text(state.message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                DetailCard(title: "AI 摘要") {
                    Text(file.recordSummary.isEmpty ? file.bestDescription : file.recordSummary)
                }

                DetailCard(title: "来源与描述") {
                    VStack(alignment: .leading, spacing: 8) {
                        LabeledContent("来源", value: file.recordSourceLabel.isEmpty ? "手动收件箱" : file.recordSourceLabel)
                        LabeledContent("记录", value: file.recordTitle)
                        if !file.description.isEmpty {
                            Text(file.description)
                        }
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
            .padding(26)
        }
        .background(.white.opacity(0.02))
    }
}

struct PreviewCard: View {
    let file: FileTimelineItem

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18)
                .fill(.white.opacity(0.045))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.08)))
            VStack(spacing: 10) {
                FileBadge(mimeType: file.mimeType, size: 54)
                Text(file.mimeType.hasPrefix("image/") ? "图片预览请点击打开文件" : "原生预览将在后续版本增强")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(minHeight: 240)
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
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "tray")
                .font(.system(size: 36))
                .foregroundStyle(.secondary)
            Text("暂无资料")
                .font(.headline)
            Text("在网页端录入后会自动同步到这里。")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
