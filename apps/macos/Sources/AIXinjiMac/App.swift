import SwiftUI
import AppKit
import UniformTypeIdentifiers

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
                    Text("原生 Mac 客户端 · 0.08")
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

                Toggle("记住密码", isOn: $state.rememberPassword)
                    .toggleStyle(.checkbox)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(width: 360, alignment: .leading)

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
    @AppStorage("timelineListWidth") private var storedListWidth: Double = 560
    @State private var detailHidden = false

    private var listWidth: CGFloat {
        get { CGFloat(storedListWidth) }
        nonmutating set { storedListWidth = Double(newValue) }
    }

    var filteredFiles: [FileTimelineItem] {
        let q = state.searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let scoped = state.files.filter { file in
            switch state.currentSection {
            case .capture:
                return true
            case .timeline:
                return true
            case .favorites:
                return state.favoriteRecordIds.contains(file.recordId)
            case .todos:
                return true
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

                if state.currentSection == .capture {
                    NativeCaptureView()
                } else if state.currentSection == .todos {
                    NativeTodoView()
                } else {
                    GeometryReader { geometry in
                        if detailHidden {
                            ZStack(alignment: .topTrailing) {
                                TimelineColumn(groups: dayGroups, expanded: true) {
                                    withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                                        detailHidden = false
                                    }
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)

                                Button {
                                    withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                                        detailHidden = false
                                    }
                                } label: {
                                    Label("展开详情", systemImage: "sidebar.right")
                                        .labelStyle(.iconOnly)
                                        .frame(width: 42, height: 42)
                                }
                                .buttonStyle(.plain)
                                .interactiveHover(radius: 14)
                                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.10)))
                                .help("展开详情")
                                .padding(18)
                            }
                        } else {
                            HStack(spacing: 0) {
                                TimelineColumn(groups: dayGroups, expanded: false) {}
                                    .frame(width: min(max(listWidth, 420), max(geometry.size.width - 420, 480)))

                                SplitHandle(
                                    onDrag: { delta in
                                        listWidth = min(max(listWidth + delta, 420), max(geometry.size.width - 420, 480))
                                    }
                                )

                                if let file = selectedFile {
                                    FileDetailView(file: file) {
                                        withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                                            detailHidden = true
                                        }
                                    }
                                        .id(file.id)
                                        .frame(maxWidth: .infinity)
                                } else {
                                    EmptyTimelineView(searching: !state.searchText.isEmpty)
                                }
                            }
                            .onChange(of: geometry.size.width) { _, width in
                                listWidth = min(max(listWidth, 420), max(width - 420, 480))
                            }
                        }
                    }
                    .background(.white.opacity(0.02))
                }
            }
        }
        .overlay(alignment: .top) {
            DragStrip()
        }
        .onChange(of: filteredFiles.map(\.id)) { _, ids in
            if state.currentSection == .capture { return }
            if let current = state.selectedFileId, ids.contains(current) { return }
            state.selectedFileId = ids.first
        }
    }
}

struct SplitHandle: View {
    let onDrag: (CGFloat) -> Void
    @State private var dragStartWidthDelta: CGFloat = 0

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.white.opacity(0.045))
                .frame(width: 12)
            Capsule()
                .fill(.white.opacity(0.38))
                .frame(width: 4, height: 72)
        }
        .frame(width: 14)
        .contentShape(Rectangle())
        .onHover { hovering in
            if hovering { NSCursor.resizeLeftRight.set() } else { NSCursor.arrow.set() }
        }
        .gesture(
            DragGesture(minimumDistance: 1)
                .onChanged { value in
                    onDrag(value.translation.width - dragStartWidthDelta)
                    dragStartWidthDelta = value.translation.width
                }
                .onEnded { _ in
                    dragStartWidthDelta = 0
                }
        )
    }
}

struct NativeCaptureView: View {
    @EnvironmentObject private var state: AppState
    @State private var isDragging = false
    @AppStorage("captureRecordInfoExpanded") private var recordInfoExpanded = false

    var canSubmit: Bool {
        !state.captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !state.captureFiles.isEmpty
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                CaptureHero()

                VStack(alignment: .leading, spacing: 18) {
                    Button {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.86)) {
                            recordInfoExpanded.toggle()
                        }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("记录信息").font(.headline)
                                Text("标题、标签、来源与备注（选填）")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.down")
                                .rotationEffect(.degrees(recordInfoExpanded ? 180 : 0))
                        }
                        .padding(14)
                        .contentShape(Rectangle())
                        .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
                    }
                    .buttonStyle(.plain)
                    .interactiveHover(radius: 14)

                    if recordInfoExpanded {
                        VStack(spacing: 12) {
                            HStack(spacing: 12) {
                                CaptureField(title: "标题", placeholder: "标题（选填）", text: $state.captureTitle)
                                CaptureField(title: "标签", placeholder: "标签（空格分隔）", text: $state.captureTags)
                            }

                            HStack(spacing: 12) {
                                CaptureField(title: "来源", placeholder: "微信剪贴板 / 飞书会议 / Mac 录入", text: $state.captureSource)
                                CaptureField(title: "备注", placeholder: "补充上下文（选填）", text: $state.captureContextNote)
                            }
                        }
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }

                    CaptureEditorBox(isDragging: $isDragging, onDrop: handleDrop(providers:))

                    if !state.captureFiles.isEmpty {
                        CaptureAttachmentGrid()
                    }

                    HStack(alignment: .center, spacing: 14) {
                        CaptureToggle(title: "AI 识别摘要", isOn: $state.enableAiSummary)
                        CaptureToggle(title: "AI 识别待办", isOn: $state.autoCreateTodo)
                        CaptureToggle(title: "启用 OCR 识别", isOn: $state.enableOcr)
                        CaptureToggle(title: "同步到 Notion", isOn: $state.syncToNotion)
                        CaptureToggle(title: "同步到 flomo", isOn: $state.syncToFlomo)
                        CaptureToggle(title: "强制关联待办", isOn: $state.forceLinkToTodo)

                        Spacer(minLength: 10)

                        Button {
                            Task { await state.submitCapture() }
                        } label: {
                            if state.isLoading {
                                ProgressView().controlSize(.small)
                                    .frame(width: 92)
                            } else {
                                Text("提交记录")
                                    .font(.system(size: 14, weight: .semibold))
                                    .frame(width: 92)
                            }
                        }
                        .buttonStyle(.plain)
                        .keyboardShortcut(.return, modifiers: .command)
                        .padding(.horizontal, 18)
                        .frame(height: 42)
                        .background(canSubmit ? .white : .white.opacity(0.14), in: RoundedRectangle(cornerRadius: 13))
                        .foregroundStyle(canSubmit ? .black : .secondary)
                        .interactiveHover(radius: 13, enabled: canSubmit && !state.isLoading)
                        .disabled(state.isLoading || !canSubmit)
                    }
                    .padding(.top, 2)

                    if !state.message.isEmpty {
                        Text(state.message)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(24)
                .background(.black.opacity(0.20), in: RoundedRectangle(cornerRadius: 22))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.08)))
            }
            .padding(28)
            .frame(maxWidth: 1320, alignment: .leading)
        }
        .background(.white.opacity(0.025))
    }

    private func handleDrop(providers: [NSItemProvider]) -> Bool {
        var handled = false
        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                handled = true
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { item, _ in
                    guard let data = item as? Data,
                          let url = URL(dataRepresentation: data, relativeTo: nil) else { return }
                    DispatchQueue.main.async { state.addCaptureFiles([url]) }
                }
            } else if provider.canLoadObject(ofClass: NSImage.self) {
                handled = true
                _ = provider.loadObject(ofClass: NSImage.self) { image, _ in
                    guard let image = image as? NSImage else { return }
                    DispatchQueue.main.async { state.addCaptureImage(image) }
                }
            }
        }
        return handled
    }
}

struct NativeTodoView: View {
    @EnvironmentObject private var state: AppState
    @State private var newContent = ""
    @State private var priority = "medium"
    @State private var filter = "pending"

    private var filteredTodos: [TodoItem] {
        filter == "all" ? state.todos : state.todos.filter { $0.status == filter }
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("待办事项").font(.title2.bold())
                        Text("与网页端实时同步，可新增、完成和删除")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        Task { await state.loadTodos() }
                    } label: {
                        Label("刷新", systemImage: "arrow.clockwise")
                            .controlButton()
                    }
                    .buttonStyle(.plain)
                }

                HStack(spacing: 10) {
                    TextField("添加新待办…", text: $newContent)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 14)
                        .frame(height: 42)
                        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.09)))
                        .onSubmit { submit() }

                    Picker("优先级", selection: $priority) {
                        Text("紧急").tag("urgent")
                        Text("高").tag("high")
                        Text("中").tag("medium")
                        Text("低").tag("low")
                    }
                    .labelsHidden()
                    .frame(width: 92)

                    Button("添加") { submit() }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .disabled(newContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                HStack(spacing: 8) {
                    TodoFilterButton(title: "待处理", value: "pending", selected: $filter)
                    TodoFilterButton(title: "已完成", value: "done", selected: $filter)
                    TodoFilterButton(title: "全部", value: "all", selected: $filter)
                    Spacer()
                    Text("\(filteredTodos.count) 条")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(24)
            .background(.black.opacity(0.16))

            ScrollView {
                LazyVStack(spacing: 10) {
                    if filteredTodos.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "checkmark.circle")
                                .font(.system(size: 38))
                                .foregroundStyle(.secondary)
                            Text(filter == "pending" ? "待办已清空" : "暂无待办")
                                .font(.headline)
                            Text("在上方输入内容即可新建，网页端也会同步显示。")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 110)
                    } else {
                        ForEach(filteredTodos) { todo in
                            TodoRow(todo: todo)
                        }
                    }
                }
                .padding(24)
            }
        }
        .task { await state.loadTodos() }
    }

    private func submit() {
        let content = newContent
        newContent = ""
        filter = "pending"
        Task { await state.createTodo(content: content, priority: priority) }
    }
}

struct TodoFilterButton: View {
    let title: String
    let value: String
    @Binding var selected: String

    var body: some View {
        Button(title) { selected = value }
            .buttonStyle(.plain)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(selected == value ? .white.opacity(0.16) : .white.opacity(0.05), in: RoundedRectangle(cornerRadius: 9))
            .interactiveHover(radius: 9)
    }
}

struct TodoRow: View {
    @EnvironmentObject private var state: AppState
    let todo: TodoItem

    var body: some View {
        HStack(spacing: 14) {
            Button {
                Task { await state.toggleTodo(todo) }
            } label: {
                Image(systemName: todo.isDone ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 21))
                    .foregroundStyle(todo.isDone ? .green : .secondary)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
            .interactiveHover(radius: 16)

            VStack(alignment: .leading, spacing: 6) {
                Text(todo.content)
                    .font(.body.weight(.medium))
                    .strikethrough(todo.isDone)
                    .foregroundStyle(todo.isDone ? .secondary : .primary)
                HStack(spacing: 8) {
                    Text(todo.priorityLabel)
                        .foregroundStyle(todo.priority == "urgent" ? .red : todo.priority == "high" ? .orange : .secondary)
                    Text(todo.createdAt.shortDateTime)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                Task { await state.deleteTodo(todo) }
            } label: {
                Image(systemName: "trash")
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .destructiveHover(radius: 10)
            .help("删除待办")
        }
        .padding(16)
        .contentShape(Rectangle())
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.075)))
    }
}

struct CaptureHero: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        HStack(spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text("录入")
                    .font(.system(size: 24, weight: .bold))
                Text("文字、截图、文件、剪贴板内容统一进入信源 · 时间线")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Toggle("监听剪贴板", isOn: Binding(
                get: { state.autoClipboardEnabled },
                set: { state.setClipboardMonitoring($0) }
            ))
            .toggleStyle(.switch)
        }
        .padding(20)
        .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.08)))
    }
}

struct CaptureField: View {
    let title: String
    let placeholder: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            TextField(placeholder, text: $text)
                .textFieldStyle(.plain)
                .padding(.horizontal, 14)
                .frame(height: 42)
                .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.08)))
        }
    }
}

struct CaptureEditorBox: View {
    @EnvironmentObject private var state: AppState
    @Binding var isDragging: Bool
    let onDrop: ([NSItemProvider]) -> Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CaptureToolbar()
            PasteAwareTextView(
                text: $state.captureText,
                placeholder: "输入文本或 Markdown，支持直接粘贴截图...",
                onPasteImage: { image in state.addCaptureImage(image) },
                onPasteFiles: { urls in state.addCaptureFiles(urls) },
                onSubmit: { Task { await state.submitCapture() } }
            )
            .frame(minHeight: 340)

            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Button {
                        state.captureClipboardNow()
                    } label: {
                        Label("读取剪贴板", systemImage: "doc.on.clipboard")
                    }
                    .buttonStyle(.plain)
                    .controlButton()

                    Button {
                        state.chooseCaptureFiles()
                    } label: {
                        Label("添加附件", systemImage: "paperclip")
                    }
                    .buttonStyle(.plain)
                    .controlButton()

                    Spacer()

                    if state.looksLikeTodo(state.captureText) {
                        Label("疑似待办", systemImage: "checkmark.square")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.pink)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

                AttachmentDropZone(isDragging: isDragging)
                    .onTapGesture { state.chooseCaptureFiles() }
                    .onDrop(
                        of: [UTType.fileURL.identifier, UTType.image.identifier, UTType.tiff.identifier, UTType.png.identifier],
                        isTargeted: $isDragging,
                        perform: onDrop
                    )
                    .padding(.horizontal, 16)
                    .padding(.bottom, 14)
            }
        }
        .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(isDragging ? Color.accentColor.opacity(0.65) : .white.opacity(0.08)))
    }
}

struct CaptureToolbar: View {
    private let items = ["H1", "H2", "H3", "B", "I", "S", "<>", "列表", "待办", "引用", "分割"]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(minWidth: item.count > 2 ? 34 : 24, minHeight: 24)
                    .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 7))
            }
            Spacer()
            Text("Markdown")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .overlay(alignment: .bottom) {
            Rectangle().fill(.white.opacity(0.08)).frame(height: 1)
        }
    }
}

struct AttachmentDropZone: View {
    let isDragging: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "paperclip")
                .font(.title3)
                .foregroundStyle(isDragging ? Color.accentColor : .secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text("拖拽或点击添加附件（图片、视频、音频、文档等）")
                    .font(.callout.weight(.semibold))
                Text("支持 JPG、PNG、PDF、Word、Excel、MP4、MP3 等")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(18)
        .background(isDragging ? Color.accentColor.opacity(0.12) : .white.opacity(0.035), in: RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(style: StrokeStyle(lineWidth: 1, dash: [5, 5]))
                .foregroundStyle(isDragging ? Color.accentColor.opacity(0.7) : .white.opacity(0.12))
        )
        .interactiveHover(radius: 14)
    }
}

struct CaptureAttachmentGrid: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 12)], alignment: .leading, spacing: 12) {
            ForEach(state.captureFiles) { attachment in
                CaptureAttachmentCard(attachment: attachment)
            }
        }
    }
}

struct CaptureAttachmentCard: View {
    @EnvironmentObject private var state: AppState
    let attachment: CaptureAttachment

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                CaptureAttachmentPreview(attachment: attachment)
                VStack(alignment: .leading, spacing: 2) {
                    Text(attachment.name)
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)
                    Text(attachment.byteSizeText)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    state.removeCaptureFile(attachment)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .interactiveHover(radius: 8)
            }

            TextField("附件标签（空格分隔）", text: Binding(
                get: { attachment.tags },
                set: { state.updateCaptureFile(attachment, tags: $0) }
            ))
            .textFieldStyle(.plain)
            .font(.caption)
            .padding(.horizontal, 10)
            .frame(height: 32)
            .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 9))

            TextField("附件描述（选填）", text: Binding(
                get: { attachment.note },
                set: { state.updateCaptureFile(attachment, note: $0) }
            ))
            .textFieldStyle(.plain)
            .font(.caption)
            .padding(.horizontal, 10)
            .frame(height: 32)
            .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 9))
        }
        .padding(12)
        .background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.08)))
    }
}

struct CaptureAttachmentPreview: View {
    let attachment: CaptureAttachment

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(.white.opacity(0.08))
            if attachment.isImage, let image = NSImage(contentsOf: attachment.url) {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                Text(FileBadge(mimeType: attachment.mimeType).label)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 46, height: 46)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(.white.opacity(0.10)))
    }
}

struct CaptureToggle: View {
    let title: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(title, isOn: $isOn)
            .toggleStyle(.checkbox)
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize()
    }
}

struct PasteAwareTextView: NSViewRepresentable {
    @Binding var text: String
    let placeholder: String
    let onPasteImage: (NSImage) -> Void
    let onPasteFiles: ([URL]) -> Void
    let onSubmit: () -> Void

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .noBorder

        let textView = PasteAwareNSTextView()
        textView.delegate = context.coordinator
        textView.onPasteImage = onPasteImage
        textView.onPasteFiles = onPasteFiles
        textView.onSubmit = onSubmit
        textView.string = text
        textView.font = .systemFont(ofSize: 15)
        textView.textColor = .labelColor
        textView.insertionPointColor = .labelColor
        textView.backgroundColor = .clear
        textView.drawsBackground = false
        textView.isRichText = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.textContainerInset = NSSize(width: 18, height: 18)
        textView.textContainer?.widthTracksTextView = true
        textView.autoresizingMask = [.width]
        scrollView.documentView = textView
        context.coordinator.textView = textView
        context.coordinator.placeholder = placeholder
        context.coordinator.updatePlaceholder()
        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? PasteAwareNSTextView else { return }
        textView.onPasteImage = onPasteImage
        textView.onPasteFiles = onPasteFiles
        textView.onSubmit = onSubmit
        if textView.string != text {
            textView.string = text
        }
        context.coordinator.updatePlaceholder()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text)
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        @Binding var text: String
        weak var textView: PasteAwareNSTextView?
        var placeholder = ""

        init(text: Binding<String>) {
            _text = text
        }

        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            text = textView.string
            updatePlaceholder()
        }

        func updatePlaceholder() {
            guard let textView else { return }
            textView.placeholderText = textView.string.isEmpty ? placeholder : nil
            textView.needsDisplay = true
        }
    }
}

final class PasteAwareNSTextView: NSTextView {
    var onPasteImage: ((NSImage) -> Void)?
    var onPasteFiles: (([URL]) -> Void)?
    var onSubmit: (() -> Void)?
    var placeholderText: String?

    override func paste(_ sender: Any?) {
        let pasteboard = NSPasteboard.general
        if let urls = pasteboard.readObjects(
            forClasses: [NSURL.self],
            options: [.urlReadingFileURLsOnly: true]
        ) as? [URL], !urls.isEmpty {
            onPasteFiles?(urls)
        }
        if let image = NSImage(pasteboard: pasteboard) {
            onPasteImage?(image)
        }
        if let string = pasteboard.string(forType: .string), !string.isEmpty {
            insertText(string, replacementRange: selectedRange())
        }
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 36, event.modifierFlags.contains(.command) {
            onSubmit?()
            return
        }
        super.keyDown(with: event)
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard let placeholderText, string.isEmpty else { return }
        let rect = NSRect(x: textContainerInset.width + 4, y: textContainerInset.height, width: bounds.width - 32, height: 24)
        placeholderText.draw(in: rect, withAttributes: [
            .foregroundColor: NSColor.placeholderTextColor,
            .font: font ?? NSFont.systemFont(ofSize: 15)
        ])
    }
}

struct DragStrip: View {
    var body: some View {
        WindowDragView()
            .frame(height: 52)
            .ignoresSafeArea(edges: .top)
            .allowsHitTesting(true)
    }
}

struct WindowDragView: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        DraggingNSView()
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

final class DraggingNSView: NSView {
    override func hitTest(_ point: NSPoint) -> NSView? {
        self
    }

    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 {
            window?.zoom(nil)
        } else {
            window?.performDrag(with: event)
        }
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
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text("AI 信迹")
                    .font(.system(size: 26, weight: .bold))
                Text("知识收件箱")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 8) {
                SidebarButton(title: AppSection.capture.title, systemImage: AppSection.capture.systemImage, active: state.currentSection == .capture) {
                    state.currentSection = .capture
                }
                SidebarButton(title: AppSection.timeline.title, systemImage: AppSection.timeline.systemImage, active: state.currentSection == .timeline) {
                    state.currentSection = .timeline
                }
                SidebarButton(title: AppSection.favorites.title, systemImage: AppSection.favorites.systemImage, badge: state.favoriteRecordIds.count, active: state.currentSection == .favorites) {
                    state.currentSection = .favorites
                }
                SidebarButton(title: AppSection.todos.title, systemImage: AppSection.todos.systemImage, badge: state.todos.filter { !$0.isDone }.count, active: state.currentSection == .todos) {
                    state.currentSection = .todos
                    Task { await state.loadTodos() }
                }
            }

            Spacer()

            VStack(alignment: .leading, spacing: 10) {
                SidebarButton(title: "打开网页版", systemImage: "safari", active: false) {
                    state.openWebCapture()
                }
                SidebarButton(title: "刷新同步", systemImage: "arrow.clockwise", active: false) {
                    Task { await state.loadTimeline() }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Button { state.chooseAvatar() } label: {
                        Group {
                            if let avatar = state.avatarImage {
                                Image(nsImage: avatar).resizable().scaledToFill()
                            } else {
                                Circle()
                                    .fill(LinearGradient(colors: [.purple, .cyan], startPoint: .topLeading, endPoint: .bottomTrailing))
                                    .overlay(Text(String(state.email.prefix(1)).uppercased()).font(.headline))
                            }
                        }
                        .frame(width: 46, height: 46)
                        .clipShape(Circle())
                        .overlay(Circle().stroke(.white.opacity(0.18)))
                    }
                    .buttonStyle(.plain)
                    .interactiveHover(radius: 23)
                    .help("点击更换头像")
                    Text(state.email)
                        .font(.footnote.weight(.semibold))
                        .lineLimit(1)
                    Button("退出登录") { state.signOut() }
                        .buttonStyle(.plain)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .destructiveHover(radius: 8)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.08)))
            }
        }
        .padding(22)
        .frame(width: 230)
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
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .frame(minWidth: 24, minHeight: 22)
                        .background(.pink, in: Capsule())
                        .shadow(color: .pink.opacity(0.28), radius: 10, y: 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(active ? .white.opacity(0.11) : .clear, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .interactiveHover(radius: 14, enabled: !active)
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
    let expanded: Bool
    let onOpenDetail: () -> Void

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                if groups.isEmpty {
                    EmptyListHint(searching: !state.searchText.isEmpty)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 120)
                } else {
                    ForEach(groups) { group in
                        TimelineDaySection(group: group, expanded: expanded, onOpenDetail: onOpenDetail)
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
    let expanded: Bool
    let onOpenDetail: () -> Void

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
                    TimelineFileCard(file: file, expanded: expanded, onOpenDetail: onOpenDetail)
                }
            }
        }
    }
}

struct TimelineFileCard: View {
    @EnvironmentObject private var state: AppState
    let file: FileTimelineItem
    let expanded: Bool
    let onOpenDetail: () -> Void

    var isSelected: Bool { state.selectedFileId == file.id }
    var isFavorite: Bool { state.favoriteRecordIds.contains(file.recordId) }

    var body: some View {
        Button {
            state.selectedFileId = file.id
            Task { await state.loadPreview(for: file) }
            onOpenDetail()
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
                        TimelineThumbnail(file: file)
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
                .shadow(color: isSelected ? Color.accentColor.opacity(0.13) : .black.opacity(0.0), radius: 18, y: 8)
            }
            .frame(maxWidth: expanded ? 900 : .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        .interactiveHover(radius: 16)
        .task(id: file.id) {
            await state.loadPreview(for: file)
        }
    }
}

struct TimelineThumbnail: View {
    @EnvironmentObject private var state: AppState
    let file: FileTimelineItem

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(.white.opacity(0.08))
            if file.mimeType.hasPrefix("image/"), let image = state.previewImages[file.id] {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else if file.mimeType.hasPrefix("image/"), state.previewLoadingIds.contains(file.id) {
                ProgressView()
                    .controlSize(.small)
            } else {
                FileBadge(mimeType: file.mimeType)
            }
        }
        .frame(width: 42, height: 42)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.10)))
        .clipped()
    }
}

struct FileDetailView: View {
    @EnvironmentObject private var state: AppState
    let file: FileTimelineItem
    let onClose: () -> Void

    var isFavorite: Bool { state.favoriteRecordIds.contains(file.recordId) }

    var body: some View {
        ZStack(alignment: .topTrailing) {
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
                        .interactiveHover(radius: 10)

                        Button {
                            Task { await state.openAsset(file) }
                        } label: {
                            Label("打开文件", systemImage: "arrow.up.right.square")
                        }
                        .buttonStyle(.borderedProminent)
                        .interactiveHover(radius: 10)

                        Button {
                            Task { await state.downloadAsset(file) }
                        } label: {
                            Label("下载到本地", systemImage: "arrow.down.circle")
                        }
                        .buttonStyle(.bordered)
                        .interactiveHover(radius: 10)

                        Button {
                            state.copyShareLink(file)
                        } label: {
                            Label("复制链接", systemImage: "square.and.arrow.up")
                        }
                        .buttonStyle(.bordered)
                        .interactiveHover(radius: 10)

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

            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .frame(width: 34, height: 34)
            }
            .buttonStyle(.plain)
            .background(.black.opacity(0.42), in: Circle())
            .overlay(Circle().stroke(.white.opacity(0.14)))
            .destructiveHover(radius: 17)
            .help("关闭详情")
            .padding(.top, 18)
            .padding(.trailing, 18)
        }
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
            Text(searching ? "换个关键词再试试。" : "在录入里保存后会自动同步到这里。")
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
            Text(searching ? "搜索范围包含文件名、标签、OCR 和摘要。" : "点击左侧录入，保存后会进入信源 · 时间线。")
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

struct InteractiveHoverModifier: ViewModifier {
    let radius: CGFloat
    let enabled: Bool
    @State private var hovering = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(enabled && hovering ? 1.015 : 1.0)
            .shadow(color: enabled && hovering ? .black.opacity(0.24) : .clear, radius: enabled && hovering ? 16 : 0, y: enabled && hovering ? 8 : 0)
            .animation(.spring(response: 0.22, dampingFraction: 0.82), value: hovering)
            .contentShape(RoundedRectangle(cornerRadius: radius))
            .onHover { inside in
                guard enabled else { return }
                hovering = inside
                if inside {
                    NSCursor.pointingHand.set()
                } else {
                    NSCursor.arrow.set()
                }
            }
    }
}

struct DestructiveHoverModifier: ViewModifier {
    let radius: CGFloat
    @State private var hovering = false

    func body(content: Content) -> some View {
        content
            .foregroundStyle(hovering ? .white : .secondary)
            .background(hovering ? Color.red.opacity(0.92) : Color.clear, in: RoundedRectangle(cornerRadius: radius))
            .scaleEffect(hovering ? 1.04 : 1)
            .contentShape(RoundedRectangle(cornerRadius: radius))
            .animation(.spring(response: 0.2, dampingFraction: 0.84), value: hovering)
            .onHover { inside in
                hovering = inside
                if inside { NSCursor.pointingHand.set() } else { NSCursor.arrow.set() }
            }
    }
}

extension View {
    func interactiveHover(radius: CGFloat = 12, enabled: Bool = true) -> some View {
        modifier(InteractiveHoverModifier(radius: radius, enabled: enabled))
    }

    func destructiveHover(radius: CGFloat = 10) -> some View {
        modifier(DestructiveHoverModifier(radius: radius))
    }

    func controlButton() -> some View {
        self
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
            .interactiveHover(radius: 10)
    }
}
