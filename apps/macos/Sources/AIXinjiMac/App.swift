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

struct CaptureProjectPicker: View {
    @EnvironmentObject private var state: AppState
    @FocusState private var focused: Bool

    private var query: String {
        state.captureProjectQuery.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var filteredProjects: [Project] {
        let list = state.projects.filter { !$0.archived }
        guard !query.isEmpty else { return Array(list.prefix(8)) }
        return Array(list.filter { $0.searchHaystack.localizedCaseInsensitiveContains(query) }.prefix(8))
    }

    private var hasExactProject: Bool {
        state.projects.contains { $0.name.caseInsensitiveCompare(query) == .orderedSame }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("项目")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            HStack(spacing: 10) {
                Image(systemName: state.selectedCaptureProject == nil ? "magnifyingglass" : "folder.fill")
                    .foregroundStyle(state.selectedCaptureProject == nil ? .secondary : Color.accentColor)
                TextField("检索或输入项目名称", text: Binding(
                    get: { state.captureProjectQuery },
                    set: { value in
                        state.captureProjectQuery = value
                        if state.selectedCaptureProject?.name != value {
                            state.captureProjectId = ""
                        }
                    }
                ))
                .textFieldStyle(.plain)
                .focused($focused)
                .onSubmit {
                    if let first = filteredProjects.first {
                        select(first)
                    }
                }
                Spacer()
                if state.selectedCaptureProject != nil || !state.captureProjectQuery.isEmpty {
                    Button {
                        state.captureProjectId = ""
                        state.captureProjectQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .interactiveHover(radius: 8)
                    .help("清除项目")
                } else {
                    Button {
                        Task { await state.loadProjects() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .interactiveHover(radius: 8)
                    .help("刷新项目")
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 42)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.08)))

            if focused || !query.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    if filteredProjects.isEmpty {
                        Text("没有匹配项目")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                    } else {
                        ForEach(filteredProjects) { project in
                            CaptureProjectOption(
                                project: project,
                                selected: state.captureProjectId == project.id
                            ) {
                                select(project)
                            }
                        }
                    }

                    if !query.isEmpty && !hasExactProject {
                        Button {
                            Task { await state.createProject(name: query) }
                        } label: {
                            Label("新建项目：\(query)", systemImage: "plus.circle")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .interactiveHover(radius: 10)
                    }
                }
                .padding(6)
                .background(.black.opacity(0.20), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.08)))
                .frame(maxHeight: 210)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .task {
            if state.projects.isEmpty {
                await state.loadProjects()
            }
        }
    }

    private func select(_ project: Project) {
        state.captureProjectId = project.id
        state.captureProjectQuery = project.name
        focused = false
    }
}

struct CaptureProjectOption: View {
    let project: Project
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: selected ? "checkmark.circle.fill" : "folder")
                    .foregroundStyle(selected ? Color.accentColor : Color.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(project.name)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if !project.description.isEmpty {
                        Text(project.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer()
                Text(project.progressText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .interactiveHover(radius: 10)
    }
}

struct NativeProjectsView: View {
    @EnvironmentObject private var state: AppState
    @State private var newName = ""
    @State private var newDescription = ""
    @State private var localSearch = ""

    private var filteredProjects: [Project] {
        let q = [state.searchText, localSearch]
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return state.projects }
        return state.projects.filter { $0.searchHaystack.localizedCaseInsensitiveContains(q) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                projectToolbar
                newProjectComposer

                if filteredProjects.isEmpty {
                    EmptyListHint(searching: !localSearch.isEmpty || !state.searchText.isEmpty)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 80)
                } else {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        ForEach(filteredProjects) { project in
                            ProjectListRow(project: project)
                        }
                    }
                }
            }
            .padding(28)
        }
        .task { await state.loadProjects() }
    }

    private var projectToolbar: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("项目列表")
                        .font(.title2.bold())
                    Text("录入时可直接关联项目，项目任务继续与网页端保持同一套数据。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(filteredProjects.count) 个项目")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.white.opacity(0.07), in: Capsule())
                Button {
                    Task { await state.loadProjects() }
                } label: {
                    Label("刷新项目", systemImage: "arrow.clockwise")
                        .controlButton()
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("搜索项目名称、描述", text: $localSearch)
                    .textFieldStyle(.plain)
            }
            .padding(.horizontal, 14)
            .frame(height: 42)
            .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.08)))
        }
        .padding(20)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.08)))
    }

    private var newProjectComposer: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("新建项目")
                .font(.headline)
            HStack(spacing: 10) {
                TextField("项目名称", text: $newName)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 14)
                    .frame(height: 42)
                    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                TextField("描述（选填）", text: $newDescription)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 14)
                    .frame(height: 42)
                    .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
                Button {
                    let name = newName
                    let desc = newDescription
                    newName = ""
                    newDescription = ""
                    Task { await state.createProject(name: name, description: desc) }
                } label: {
                    Label("创建", systemImage: "plus")
                        .frame(width: 76, height: 42)
                }
                .buttonStyle(.plain)
                .background(.white, in: RoundedRectangle(cornerRadius: 12))
                .foregroundStyle(.black)
                .interactiveHover(radius: 12, enabled: !newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(20)
        .background(.black.opacity(0.18), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.08)))
    }
}

struct ProjectListRow: View {
    @EnvironmentObject private var state: AppState
    let project: Project

    private var progressRatio: Double {
        let total = Double(project.totalTasks ?? 0)
        guard total > 0 else { return 0 }
        return min(max(Double(project.doneCount ?? 0) / total, 0), 1)
    }

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: "folder.fill")
                .font(.title2)
                .foregroundStyle(.cyan)
                .frame(width: 46, height: 46)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text(project.name)
                        .font(.headline)
                        .lineLimit(1)
                    Text(project.archived ? "已归档" : "进行中")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(project.archived ? Color.secondary : Color.cyan)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(.white.opacity(0.07), in: Capsule())
                }

                Text(project.description.isEmpty ? "暂无描述" : project.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                HStack(spacing: 12) {
                    Text("创建 \(project.createdAt.shortDateTime)")
                    Text("更新 \(project.updatedAt.shortDateTime)")
                    Text(project.progressText)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 18)

            VStack(alignment: .trailing, spacing: 8) {
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.08))
                    Capsule().fill(Color.accentColor.opacity(0.82))
                        .frame(width: max(8, 112 * progressRatio))
                }
                .frame(width: 112, height: 6)

                HStack(spacing: 8) {
                    Text(project.progressText)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    Button {
                        state.captureProjectId = project.id
                        state.captureProjectQuery = project.name
                        state.currentSection = .capture
                    } label: {
                        Label("用于录入", systemImage: "plus.circle")
                    }
                    .buttonStyle(.plain)
                    .controlButton()

                    Button {
                        state.openProjectInWeb(project)
                    } label: {
                        Label("打开项目", systemImage: "arrow.up.right.square")
                    }
                    .buttonStyle(.plain)
                    .controlButton()
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.08)))
        .interactiveHover(radius: 16)
    }
}
struct NativeFavoritesView: View {
    @EnvironmentObject private var state: AppState
    @AppStorage("favoritesListWidth") private var storedFavoritesListWidth: Double = 620
    @State private var selectedRecordId: String?
    @State private var detailHidden = false
    private let minListWidth: CGFloat = 430
    private let minDetailWidth: CGFloat = 430

    private var listWidth: CGFloat {
        get { CGFloat(storedFavoritesListWidth) }
        nonmutating set { storedFavoritesListWidth = Double(newValue) }
    }

    private func clampedListWidth(for totalWidth: CGFloat) -> CGFloat {
        let maxWidth = max(minListWidth, totalWidth - minDetailWidth)
        return min(max(listWidth, minListWidth), maxWidth)
    }

    private var orderedRecords: [KnowledgeRecord] {
        let q = state.searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let filtered = q.isEmpty
            ? state.favoriteRecords
            : state.favoriteRecords.filter { $0.searchHaystack.localizedCaseInsensitiveContains(q) }
        let pinOrder = Dictionary(uniqueKeysWithValues: state.pinnedFavoriteIds.enumerated().map { ($0.element, $0.offset) })
        return filtered.sorted { lhs, rhs in
            let lp = pinOrder[lhs.id]
            let rp = pinOrder[rhs.id]
            if let lp, let rp { return lp < rp }
            if lp != nil { return true }
            if rp != nil { return false }
            return lhs.createdAt > rhs.createdAt
        }
    }

    private var selectedRecord: KnowledgeRecord? {
        if let selectedRecordId, let selected = orderedRecords.first(where: { $0.id == selectedRecordId }) {
            return selected
        }
        return orderedRecords.first
    }

    var body: some View {
        GeometryReader { geometry in
            if orderedRecords.isEmpty {
                EmptyListHint(searching: !state.searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .task { await state.loadFavorites() }
            } else if detailHidden {
                ScrollView {
                    favoritesList(expanded: true)
                        .padding(28)
                        .frame(maxWidth: 980)
                        .frame(maxWidth: .infinity)
                }
                .overlay(alignment: .topTrailing) {
                    Button {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.86)) {
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
                    .padding(20)
                }
            } else {
                HStack(spacing: 0) {
                    ScrollView {
                        favoritesList(expanded: false)
                            .padding(24)
                    }
                    .frame(width: clampedListWidth(for: geometry.size.width))
                    .background(.white.opacity(0.03))

                    SplitHandle(
                        width: Binding(
                            get: { clampedListWidth(for: geometry.size.width) },
                            set: { listWidth = $0 }
                        ),
                        availableWidth: geometry.size.width,
                        minPrimaryWidth: minListWidth,
                        minSecondaryWidth: minDetailWidth
                    )

                    if let record = selectedRecord {
                        FavoriteDetailView(record: record) {
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.86)) {
                                detailHidden = true
                            }
                        }
                        .id(record.id)
                        .frame(maxWidth: .infinity)
                    }
                }
                .onChange(of: geometry.size.width) { _, width in
                    listWidth = clampedListWidth(for: width)
                }
            }
        }
        .task { await state.loadFavorites() }
        .onChange(of: orderedRecords.map(\.id)) { _, ids in
            if let selectedRecordId, ids.contains(selectedRecordId) { return }
            selectedRecordId = ids.first
        }
    }

    private func favoritesList(expanded: Bool) -> some View {
        LazyVStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Label("我的收藏", systemImage: "star")
                    .font(.headline)
                    .foregroundStyle(.yellow)
                Spacer()
                Button {
                    Task { await state.loadFavorites() }
                } label: {
                    Label("刷新", systemImage: "arrow.clockwise")
                        .controlButton()
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, 8)

            ForEach(orderedRecords) { record in
                FavoriteRecordCard(
                    record: record,
                    selected: selectedRecord?.id == record.id,
                    expanded: expanded
                ) {
                    selectedRecordId = record.id
                    if expanded {
                        detailHidden = false
                    }
                }
            }
        }
    }
}

struct FavoriteRecordCard: View {
    @EnvironmentObject private var state: AppState
    let record: KnowledgeRecord
    let selected: Bool
    let expanded: Bool
    let action: () -> Void

    private var pinned: Bool { state.pinnedFavoriteIds.contains(record.id) }

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 14) {
                RecordSmallPreview(record: record)
                VStack(alignment: .leading, spacing: 7) {
                    HStack(spacing: 8) {
                        Text(record.typeLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(record.createdAt.shortDateTime)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button {
                            state.togglePinnedFavorite(record)
                        } label: {
                            Image(systemName: pinned ? "pin.fill" : "pin")
                                .foregroundStyle(pinned ? .yellow : .secondary)
                                .frame(width: 24, height: 24)
                        }
                        .buttonStyle(.plain)
                        .interactiveHover(radius: 8)
                        .help(pinned ? "取消置顶" : "置顶")
                    }
                    Text(record.title)
                        .font(.headline)
                        .lineLimit(1)
                    Text(record.bestSummary)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(expanded ? 3 : 2)
                    HStack(spacing: 8) {
                        Text(record.sourceLabel.isEmpty ? "手动收件箱" : record.sourceLabel)
                            .lineLimit(1)
                        Spacer()
                        ForEach(Array(record.keywords.prefix(expanded ? 4 : 2)), id: \.self) { tag in
                            Text("#\(tag)")
                                .lineLimit(1)
                        }
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }
            .padding(14)
            .frame(maxWidth: expanded ? 920 : .infinity, alignment: .leading)
            .background(selected ? .white.opacity(0.11) : .white.opacity(0.045), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(selected ? Color.accentColor.opacity(0.45) : .white.opacity(0.07)))
            .shadow(color: selected ? Color.accentColor.opacity(0.12) : .clear, radius: 18, y: 8)
        }
        .buttonStyle(.plain)
        .interactiveHover(radius: 16)
    }
}

struct RecordSmallPreview: View {
    @EnvironmentObject private var state: AppState
    let record: KnowledgeRecord

    private var asset: RecordAsset? {
        record.assets.first(where: { $0.mimeType.hasPrefix("image/") }) ?? record.assets.first
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(.white.opacity(0.08))
            if let asset, asset.mimeType.hasPrefix("image/"), let image = state.previewImages[asset.id] {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            } else if let asset, state.previewLoadingIds.contains(asset.id) {
                ProgressView().controlSize(.small)
            } else if let asset {
                FileBadge(mimeType: asset.mimeType)
            } else {
                FileBadge(mimeType: "text/plain")
            }
        }
        .frame(width: 48, height: 48)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.10)))
        .clipped()
        .task(id: asset?.id) {
            if let asset { await state.loadPreview(for: asset) }
        }
    }
}

struct FavoriteDetailView: View {
    @EnvironmentObject private var state: AppState
    let record: KnowledgeRecord
    let onClose: () -> Void

    private var primaryAsset: RecordAsset? {
        record.assets.first(where: { $0.mimeType.hasPrefix("image/") }) ?? record.assets.first
    }

    private var pinned: Bool { state.pinnedFavoriteIds.contains(record.id) }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text(record.typeLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(record.title)
                                .font(.title2.bold())
                                .lineLimit(2)
                            Image(systemName: "star.fill")
                                .foregroundStyle(.yellow)
                        }
                        Text(record.createdAt.shortDateTime)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if let primaryAsset {
                        RecordAssetPreview(asset: primaryAsset)
                    }

                    HStack(spacing: 10) {
                        Button {
                            state.togglePinnedFavorite(record)
                        } label: {
                            Label(pinned ? "取消置顶" : "置顶", systemImage: pinned ? "pin.fill" : "pin")
                        }
                        .buttonStyle(.bordered)
                        .interactiveHover(radius: 10)

                        Button {
                            Task { await state.removeFavoriteRecord(record) }
                        } label: {
                            Label("取消收藏", systemImage: "star.slash")
                        }
                        .buttonStyle(.bordered)
                        .destructiveHover(radius: 10)

                        Button {
                            state.openRecordInWeb(record)
                        } label: {
                            Label("新窗口打开", systemImage: "arrow.up.right.square")
                        }
                        .buttonStyle(.borderedProminent)
                        .interactiveHover(radius: 10)

                        if let primaryAsset {
                            Button {
                                Task { await state.openAsset(primaryAsset) }
                            } label: {
                                Label("打开文件", systemImage: "doc")
                            }
                            .buttonStyle(.bordered)
                            .interactiveHover(radius: 10)

                            Button {
                                Task { await state.downloadAsset(primaryAsset) }
                            } label: {
                                Label("下载", systemImage: "arrow.down.circle")
                            }
                            .buttonStyle(.bordered)
                            .interactiveHover(radius: 10)

                            Button {
                                state.copyShareLink(primaryAsset)
                            } label: {
                                Label("复制链接", systemImage: "square.and.arrow.up")
                            }
                            .buttonStyle(.bordered)
                            .interactiveHover(radius: 10)
                        }
                    }

                    DetailCard(title: "AI 摘要") {
                        Text(record.bestSummary)
                    }

                    DetailCard(title: "来源与描述") {
                        VStack(alignment: .leading, spacing: 8) {
                            LabeledContent("来源", value: record.sourceLabel.isEmpty ? "手动收件箱" : record.sourceLabel)
                            if !record.contextNote.isEmpty {
                                Text(record.contextNote)
                            }
                            if !record.contentText.isEmpty {
                                Text(record.contentText)
                            }
                        }
                    }

                    if !record.keywords.isEmpty {
                        DetailCard(title: "标签") {
                            FlowTags(tags: record.keywords)
                        }
                    }

                    if !record.actionItems.isEmpty {
                        DetailCard(title: "待办线索") {
                            VStack(alignment: .leading, spacing: 6) {
                                ForEach(record.actionItems, id: \.self) { item in
                                    Label(item, systemImage: "checkmark.square")
                                }
                            }
                        }
                    }

                    if !record.assets.isEmpty {
                        DetailCard(title: "附件") {
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 210), spacing: 10)], alignment: .leading, spacing: 10) {
                                ForEach(record.assets) { asset in
                                    FavoriteAssetRow(asset: asset)
                                }
                            }
                        }
                    }

                    if !record.extractedText.isEmpty || !record.assets.flatMap({ [$0.ocrText] }).joined().isEmpty {
                        DetailCard(title: "OCR / 文档抽取") {
                            Text(([record.extractedText] + record.assets.map(\.ocrText)).filter { !$0.isEmpty }.joined(separator: "\n\n"))
                                .font(.system(.footnote, design: .monospaced))
                        }
                    }
                }
                .padding(28)
            }

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
        .background(.white.opacity(0.02))
    }
}

struct RecordAssetPreview: View {
    @EnvironmentObject private var state: AppState
    let asset: RecordAsset

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18)
                .fill(.white.opacity(0.045))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.08)))
            if asset.mimeType.hasPrefix("image/"), let image = state.previewImages[asset.id] {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFit()
                    .padding(12)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
            } else if state.previewLoadingIds.contains(asset.id) {
                ProgressView()
            } else {
                VStack(spacing: 10) {
                    FileBadge(mimeType: asset.mimeType, size: 56)
                    Text(asset.mimeType.hasPrefix("image/") ? "未能加载图片预览，可直接打开文件" : "当前文件可打开或下载查看")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(minHeight: 300)
        .task(id: asset.id) {
            await state.loadPreview(for: asset)
        }
    }
}

struct FavoriteAssetRow: View {
    @EnvironmentObject private var state: AppState
    let asset: RecordAsset

    var body: some View {
        HStack(spacing: 10) {
            RecordAssetThumb(asset: asset)
            VStack(alignment: .leading, spacing: 3) {
                Text(asset.originalName)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                Text("\(asset.kindLabel) · \(asset.byteSizeText)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                Task { await state.openAsset(asset) }
            } label: {
                Image(systemName: "arrow.up.right.square")
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .interactiveHover(radius: 8)
        }
        .padding(10)
        .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.06)))
    }
}

struct RecordAssetThumb: View {
    @EnvironmentObject private var state: AppState
    let asset: RecordAsset

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(.white.opacity(0.08))
            if asset.mimeType.hasPrefix("image/"), let image = state.previewImages[asset.id] {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                FileBadge(mimeType: asset.mimeType, size: 32)
            }
        }
        .frame(width: 38, height: 38)
        .clipped()
        .task(id: asset.id) {
            await state.loadPreview(for: asset)
        }
    }
}

enum SettingsTab: String, CaseIterable {
    case ai = "AI 摘要"
    case notion = "Notion"
    case ticktick = "滴答清单"
    case flomo = "flomo"
    case ocr = "OCR 识别"
    case mail = "邮件收录"
    case storage = "数据备份"
}

struct NativeSettingsView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.colorScheme) private var colorScheme
    @State private var tab: SettingsTab = .ai

    private var panelFill: Color {
        colorScheme == .dark ? .black.opacity(0.18) : .white.opacity(0.84)
    }

    private var tabFill: Color {
        colorScheme == .dark ? .black.opacity(0.16) : .white.opacity(0.74)
    }

    private var selectedTabFill: Color {
        colorScheme == .dark ? .white.opacity(0.08) : .black.opacity(0.055)
    }

    private var borderFill: Color {
        colorScheme == .dark ? .white.opacity(0.08) : .black.opacity(0.08)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 0) {
                    ForEach(SettingsTab.allCases, id: \.self) { item in
                        Button {
                            withAnimation(.spring(response: 0.22, dampingFraction: 0.84)) {
                                tab = item
                            }
                        } label: {
                            Text(item.rawValue)
                                .font(.system(size: 14, weight: tab == item ? .semibold : .regular))
                                .padding(.horizontal, 18)
                                .frame(height: 44)
                                .foregroundStyle(tab == item ? .primary : .secondary)
                                .background(tab == item ? selectedTabFill : .clear)
                        }
                        .buttonStyle(.plain)
                        .interactiveHover(radius: 0)
                    }
                    Spacer()
                    Text("v\(AppInfo.version)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 14)
                }
                .background(tabFill, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(borderFill))

                VStack(alignment: .leading, spacing: 18) {
                    switch tab {
                    case .ai:
                        SettingsSectionTitle(status: state.settings.aiConfigured ? "已配置" : "未配置", title: "AI 摘要与标题生成")
                        SettingsField(title: "模型供应商", placeholder: "DeepSeek / OpenAI / Doubao", text: $state.settings.aiProvider)
                        SettingsField(title: "API 密钥", placeholder: "sk-...", text: $state.settings.aiApiKey, secure: true)
                        SettingsTextArea(title: "摘要与分析要求", text: $state.settings.aiSummaryPrompt)
                        SettingsTextArea(title: "待办识别要求", text: $state.settings.aiTodoPrompt)
                    case .notion:
                        SettingsSectionTitle(status: state.settings.notionToken.isEmpty ? "未配置" : "已配置", title: "Notion 同步")
                        SettingsField(title: "Notion Token", placeholder: "secret_...", text: $state.settings.notionToken, secure: true)
                        SettingsField(title: "父页面 ID", placeholder: "Notion Parent Page ID", text: $state.settings.notionParentPageId)
                        TestIntegrationButton(target: "notion", title: "测试 Notion")
                    case .ticktick:
                        SettingsSectionTitle(status: state.settings.tickTickConfigured ? "已配置" : "未配置", title: "滴答清单邮箱同步")
                        HStack(spacing: 12) {
                            SettingsField(title: "SMTP Host", placeholder: "smtp.example.com", text: $state.settings.smtpHost)
                            SettingsField(title: "SMTP Port", placeholder: "587", text: $state.settings.smtpPort)
                        }
                        HStack(spacing: 12) {
                            SettingsField(title: "SMTP User", placeholder: "邮箱账号", text: $state.settings.smtpUser)
                            SettingsField(title: "SMTP Pass", placeholder: "授权码", text: $state.settings.smtpPass, secure: true)
                        }
                        HStack(spacing: 12) {
                            SettingsField(title: "发件人", placeholder: "name@example.com", text: $state.settings.smtpFrom)
                            SettingsField(title: "滴答收件邮箱", placeholder: "todo@mail.dida365.com", text: $state.settings.tickTickInboxEmail)
                        }
                        Toggle("SMTP 使用安全连接", isOn: $state.settings.smtpSecure)
                            .toggleStyle(.checkbox)
                        TestIntegrationButton(target: "ticktick-email", title: "测试滴答清单")
                    case .flomo:
                        SettingsSectionTitle(status: state.settings.flomoWebhookUrl.isEmpty ? "未配置" : "已配置", title: "flomo 同步")
                        SettingsField(title: "Webhook URL", placeholder: "https://flomoapp.com/iwh/...", text: $state.settings.flomoWebhookUrl, secure: true)
                        TestIntegrationButton(target: "flomo", title: "测试 flomo")
                    case .ocr:
                        SettingsSectionTitle(status: state.settings.ocrEnabled ? "已启用" : "未启用", title: "图片 OCR 识别")
                        Toggle("启用 OCR", isOn: $state.settings.ocrEnabled)
                            .toggleStyle(.checkbox)
                        SettingsField(title: "视觉模型 Base URL", placeholder: "https://api.openai.com/v1", text: $state.settings.visionModelBaseUrl)
                        SettingsField(title: "视觉模型 API Key", placeholder: "sk-...", text: $state.settings.visionModelApiKey, secure: true)
                        SettingsField(title: "视觉模型名称", placeholder: "gpt-4o-mini / doubao-vision", text: $state.settings.visionModelName)
                    case .mail:
                        SettingsSectionTitle(status: state.settings.imapUser.isEmpty ? "未配置" : "已配置", title: "邮件收录")
                        HStack(spacing: 12) {
                            SettingsField(title: "IMAP Host", placeholder: "imap.example.com", text: $state.settings.imapHost)
                            SettingsField(title: "IMAP Port", placeholder: "993", text: $state.settings.imapPort)
                        }
                        HStack(spacing: 12) {
                            SettingsField(title: "IMAP User", placeholder: "邮箱账号", text: $state.settings.imapUser)
                            SettingsField(title: "IMAP Pass", placeholder: "授权码", text: $state.settings.imapPass, secure: true)
                        }
                        Toggle("IMAP 使用安全连接", isOn: $state.settings.imapSecure)
                            .toggleStyle(.checkbox)
                    case .storage:
                        SettingsSectionTitle(status: state.settings.storageMode, title: "OSS 与数据备份")
                        HStack(spacing: 12) {
                            SettingsField(title: "OSS Region", placeholder: "cn-hangzhou", text: $state.settings.ossRegion)
                            SettingsField(title: "OSS Bucket", placeholder: "bucket-name", text: $state.settings.ossBucket)
                        }
                        SettingsField(title: "OSS Endpoint", placeholder: "oss-cn-hangzhou.aliyuncs.com", text: $state.settings.ossEndpoint)
                        HStack(spacing: 12) {
                            SettingsField(title: "Access Key ID", placeholder: "LTAI...", text: $state.settings.ossAccessKeyId, secure: true)
                            SettingsField(title: "Access Key Secret", placeholder: "secret", text: $state.settings.ossAccessKeySecret, secure: true)
                        }
                        SettingsField(title: "Public Base URL", placeholder: "https://...", text: $state.settings.ossPublicBaseUrl)
                        SettingsField(title: "Flash Memo Ingest Token", placeholder: "用于快捷入口", text: $state.settings.flashMemoIngestToken, secure: true)
                    }

                    HStack(spacing: 12) {
                        Button {
                            Task { await state.saveSettings() }
                        } label: {
                            Label("保存配置", systemImage: "checkmark")
                                .frame(width: 118, height: 42)
                        }
                        .buttonStyle(.plain)
                        .background(.white, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.black)
                        .interactiveHover(radius: 12)

                        Button {
                            Task { await state.loadSettings() }
                        } label: {
                            Label("重新加载", systemImage: "arrow.clockwise")
                                .controlButton()
                        }
                        .buttonStyle(.plain)

                        if !state.message.isEmpty {
                            Text(state.message)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                }
                .padding(22)
                .background(panelFill, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(borderFill))
            }
            .padding(28)
            .frame(maxWidth: 1180, alignment: .leading)
        }
        .task { await state.loadSettings() }
    }
}

struct SettingsSectionTitle: View {
    @Environment(\.colorScheme) private var colorScheme
    let status: String
    let title: String

    private var chipFill: Color {
        colorScheme == .dark ? .white.opacity(0.07) : .black.opacity(0.055)
    }

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(status.contains("未") ? .orange : .green)
                .frame(width: 9, height: 9)
            Text(title)
                .font(.headline)
            Text(status)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(chipFill, in: Capsule())
        }
    }
}

struct SettingsField: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let placeholder: String
    @Binding var text: String
    var secure = false
    @State private var reveal = false

    private var fieldFill: Color {
        colorScheme == .dark ? .white.opacity(0.055) : .white.opacity(0.92)
    }

    private var fieldStroke: Color {
        colorScheme == .dark ? .white.opacity(0.08) : .black.opacity(0.10)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                Group {
                    if secure && !reveal {
                        SecureField(placeholder, text: $text)
                    } else {
                        TextField(placeholder, text: $text)
                    }
                }
                .textFieldStyle(.plain)
                if secure {
                    Button {
                        reveal.toggle()
                    } label: {
                        Image(systemName: reveal ? "eye.slash" : "eye")
                            .frame(width: 24, height: 24)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .interactiveHover(radius: 8)
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 42)
            .background(fieldFill, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(fieldStroke))
        }
    }
}

struct SettingsTextArea: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    @Binding var text: String

    private var fieldFill: Color {
        colorScheme == .dark ? .white.opacity(0.055) : .white.opacity(0.92)
    }

    private var fieldStroke: Color {
        colorScheme == .dark ? .white.opacity(0.08) : .black.opacity(0.10)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            TextEditor(text: $text)
                .font(.body)
                .scrollContentBackground(.hidden)
                .padding(10)
                .frame(minHeight: 92)
                .background(fieldFill, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(fieldStroke))
        }
    }
}

struct TestIntegrationButton: View {
    @EnvironmentObject private var state: AppState
    let target: String
    let title: String

    var body: some View {
        Button {
            Task { await state.testIntegration(target) }
        } label: {
            Label(title, systemImage: "bolt")
                .controlButton()
        }
        .buttonStyle(.plain)
    }
}

struct RootView: View {
    @EnvironmentObject private var state: AppState
    @AppStorage("aixinjiTheme") private var theme = "dark"

    var body: some View {
        ZStack {
            AppBackground()
            if state.isSignedIn {
                TimelineWorkspace()
            } else {
                LoginView()
            }
        }
        .preferredColorScheme(theme == "light" ? .light : .dark)
        .background(WindowConfigurator())
    }
}

enum AppInfo {
    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.10"
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
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            LinearGradient(
                colors: colorScheme == .dark
                    ? [
                        Color(red: 0.03, green: 0.03, blue: 0.06),
                        Color(red: 0.08, green: 0.06, blue: 0.12),
                        Color(red: 0.03, green: 0.05, blue: 0.07)
                    ]
                    : [
                        Color(red: 0.96, green: 0.96, blue: 0.99),
                        Color(red: 0.93, green: 0.90, blue: 0.98),
                        Color(red: 0.90, green: 0.96, blue: 0.98)
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
                    Text("Mac 客户端 · v\(AppInfo.version)")
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
    private let minTimelineListWidth: CGFloat = 420
    private let minTimelineDetailWidth: CGFloat = 420

    private var listWidth: CGFloat {
        get { CGFloat(storedListWidth) }
        nonmutating set { storedListWidth = Double(newValue) }
    }

    private func clampedListWidth(for totalWidth: CGFloat) -> CGFloat {
        let maxWidth = max(minTimelineListWidth, totalWidth - minTimelineDetailWidth)
        return min(max(listWidth, minTimelineListWidth), maxWidth)
    }

    var filteredFiles: [FileTimelineItem] {
        let q = state.searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let scoped = state.files.filter { file in
            switch state.currentSection {
            case .capture:
                return true
            case .timeline:
                return true
            case .projects:
                return true
            case .favorites:
                return true
            case .todos:
                return true
            case .settings:
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
                } else if state.currentSection == .projects {
                    NativeProjectsView()
                } else if state.currentSection == .todos {
                    NativeTodoView()
                } else if state.currentSection == .settings {
                    NativeSettingsView()
                } else if state.currentSection == .favorites {
                    NativeFavoritesView()
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
                                    .frame(width: clampedListWidth(for: geometry.size.width))

                                SplitHandle(
                                    width: Binding(
                                        get: { clampedListWidth(for: geometry.size.width) },
                                        set: { listWidth = $0 }
                                    ),
                                    availableWidth: geometry.size.width,
                                    minPrimaryWidth: minTimelineListWidth,
                                    minSecondaryWidth: minTimelineDetailWidth
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
                                listWidth = clampedListWidth(for: width)
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
            if state.currentSection == .capture || state.currentSection == .projects || state.currentSection == .todos || state.currentSection == .settings || state.currentSection == .favorites { return }
            if let current = state.selectedFileId, ids.contains(current) { return }
            state.selectedFileId = ids.first
        }
    }
}

struct SplitHandle: View {
    @Binding var width: CGFloat
    let availableWidth: CGFloat
    let minPrimaryWidth: CGFloat
    let minSecondaryWidth: CGFloat
    @State private var hovering = false
    @State private var dragging = false
    @State private var dragStartWidth: CGFloat = 0

    private var maxPrimaryWidth: CGFloat {
        max(minPrimaryWidth, availableWidth - minSecondaryWidth)
    }

    private func clamp(_ value: CGFloat) -> CGFloat {
        min(max(value, minPrimaryWidth), maxPrimaryWidth)
    }

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.clear)
                .frame(width: 16)
            Rectangle()
                .fill((hovering || dragging) ? Color.accentColor.opacity(0.72) : .white.opacity(0.16))
                .frame(width: hovering || dragging ? 1.5 : 1)
            RoundedRectangle(cornerRadius: 3)
                .fill((hovering || dragging) ? Color.accentColor : .white.opacity(0.34))
                .frame(width: hovering || dragging ? 4 : 3, height: hovering || dragging ? 64 : 44)
                .shadow(color: (hovering || dragging) ? Color.accentColor.opacity(0.36) : .clear, radius: 10, y: 0)
        }
        .frame(width: 16)
        .frame(maxHeight: .infinity)
        .contentShape(Rectangle())
        .overlay(
            SplitDragSurface(
                cursor: .resizeLeftRight,
                onHover: { inside in
                    hovering = inside
                    inside ? NSCursor.resizeLeftRight.set() : NSCursor.arrow.set()
                },
                onDraggingChanged: { active in
                    dragging = active
                    if active {
                        dragStartWidth = width
                        hovering = true
                    }
                    active ? NSCursor.resizeLeftRight.set() : NSCursor.arrow.set()
                },
                onTranslation: { translation in
                    width = clamp(dragStartWidth + translation)
                }
            )
        )
        .animation(.easeOut(duration: 0.10), value: hovering)
        .animation(.easeOut(duration: 0.10), value: dragging)
        .zIndex(80)
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
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .center, spacing: 12) {
                        Text("记录信息")
                            .font(.headline)
                        Spacer()
                        if !state.message.isEmpty {
                            Text(state.message)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }

                    HStack(alignment: .top, spacing: 12) {
                        CaptureField(title: "标题", placeholder: "标题（选填）", text: $state.captureTitle)
                        CaptureField(title: "标签", placeholder: "标签（空格分隔）", text: $state.captureTags)
                        CaptureProjectPicker()
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
                        Spacer(minLength: 0)
                    }
                    .padding(.top, 2)

                    Button {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.86)) {
                            recordInfoExpanded.toggle()
                        }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("更多信息").font(.headline)
                                Text("来源与补充上下文（选填）")
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
                        HStack(spacing: 12) {
                            CaptureField(title: "来源", placeholder: "微信剪贴板 / 飞书会议 / Mac 录入", text: $state.captureSource)
                            CaptureField(title: "备注", placeholder: "补充上下文（选填）", text: $state.captureContextNote)
                        }
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                    }
                }
                .padding(20)
                .background(.black.opacity(0.20), in: RoundedRectangle(cornerRadius: 22))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.08)))
            }
            .padding(24)
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
    @State private var statusFilter = "pending"
    @State private var dateFilter = "all"
    @State private var priorityFilter = "all"

    private let priorityOptions = [
        ("urgent", "紧急"),
        ("high", "高"),
        ("medium", "中"),
        ("low", "低")
    ]

    private var filteredTodos: [TodoItem] {
        let query = state.searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let sevenDaysAgo = Calendar.current.date(byAdding: .day, value: -7, to: Date()) ?? Date.distantPast
        return state.todos.filter { todo in
            if statusFilter != "all", todo.status != statusFilter { return false }
            if priorityFilter != "all", todo.priority != priorityFilter { return false }
            if dateFilter == "today", !(todo.createdDate.map { Calendar.current.isDateInToday($0) } ?? false) { return false }
            if dateFilter == "last7", !(todo.createdDate.map { $0 >= sevenDaysAgo } ?? false) { return false }
            if !query.isEmpty, !todo.content.localizedCaseInsensitiveContains(query) { return false }
            return true
        }
        .sorted { lhs, rhs in
            (lhs.createdDate ?? .distantPast) > (rhs.createdDate ?? .distantPast)
        }
    }

    private var groups: [TodoDayGroup] {
        Dictionary(grouping: filteredTodos, by: \.dayKey)
            .map { TodoDayGroup(key: $0.key, title: $0.value.first?.dayTitle ?? "未知日期", todos: $0.value) }
            .sorted { lhs, rhs in
                (lhs.todos.first?.createdDate ?? .distantPast) > (rhs.todos.first?.createdDate ?? .distantPast)
            }
    }

    private var todosNeedingSync: [TodoItem] {
        state.todos.filter(\.needsTickTickSync)
    }

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("待办事项").font(.title2.bold())
                        Text("与网页端一致的待办筛选、优先级和滴答清单同步")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if !todosNeedingSync.isEmpty {
                        Button {
                            Task { await state.syncTodosBatchToTickTick(todosNeedingSync.map(\.id)) }
                        } label: {
                            if state.todoBatchSyncing {
                                ProgressView().controlSize(.small)
                                    .frame(width: 18, height: 18)
                            } else {
                                Label("批量同步滴答（\(todosNeedingSync.count)）", systemImage: "arrow.triangle.2.circlepath")
                                    .controlButton()
                            }
                        }
                        .buttonStyle(.plain)
                        .interactiveHover(radius: 10, enabled: !state.todoBatchSyncing)
                        .disabled(state.todoBatchSyncing)
                    }
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
                    TodoFilterButton(title: "全部", value: "all", selected: $statusFilter)
                    TodoFilterButton(title: "待处理", value: "pending", selected: $statusFilter)
                    TodoFilterButton(title: "已完成", value: "done", selected: $statusFilter)
                    Divider().frame(height: 20)
                    TodoFilterButton(title: "今日", value: "today", selected: $dateFilter)
                    TodoFilterButton(title: "近七日", value: "last7", selected: $dateFilter)
                    TodoFilterButton(title: "全部日期", value: "all", selected: $dateFilter)
                    Divider().frame(height: 20)
                    TodoFilterButton(title: "紧急", value: "urgent", selected: $priorityFilter)
                    TodoFilterButton(title: "高", value: "high", selected: $priorityFilter)
                    TodoFilterButton(title: "中", value: "medium", selected: $priorityFilter)
                    TodoFilterButton(title: "低", value: "low", selected: $priorityFilter)
                    TodoFilterButton(title: "全部优先级", value: "all", selected: $priorityFilter)
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
                            Text(statusFilter == "pending" ? "待办已清空" : "暂无待办")
                                .font(.headline)
                            Text("在上方输入内容即可新建，网页端也会同步显示。")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                            .padding(.top, 110)
                    } else {
                        ForEach(groups) { group in
                            VStack(alignment: .leading, spacing: 10) {
                                HStack(spacing: 10) {
                                    Text(group.title)
                                        .font(.headline)
                                    Text("\(group.todos.count) 条")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(.white.opacity(0.06), in: Capsule())
                                }
                                ForEach(group.todos) { todo in
                                    TodoRow(todo: todo)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
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
        statusFilter = "pending"
        Task { await state.createTodo(content: content, priority: priority) }
    }
}

struct TodoDayGroup: Identifiable {
    let key: String
    let title: String
    let todos: [TodoItem]

    var id: String { key }
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

    private let priorityOptions = [
        ("urgent", "紧急"),
        ("high", "高"),
        ("medium", "中"),
        ("low", "低")
    ]

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
            VStack(alignment: .trailing, spacing: 8) {
                Menu {
                    ForEach(priorityOptions, id: \.0) { value, label in
                        Button(label) {
                            Task { await state.updateTodoPriority(todo, priority: value) }
                        }
                    }
                } label: {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(priorityColor)
                            .frame(width: 7, height: 7)
                        Text(todo.priorityLabel)
                        Image(systemName: "chevron.down")
                            .font(.caption2)
                    }
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.white.opacity(0.07), in: Capsule())
                }
                .menuStyle(.button)
                .fixedSize()
                .interactiveHover(radius: 12)

                if !todo.isDone {
                    Button {
                        Task { await state.syncTodoToTickTick(todo) }
                    } label: {
                        if state.todoSyncingIds.contains(todo.id) {
                            ProgressView().controlSize(.small)
                                .frame(width: 58, height: 22)
                        } else {
                            Label(todo.syncedAt == nil ? "同步" : "重同步", systemImage: "arrow.triangle.2.circlepath")
                                .font(.caption.weight(.semibold))
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(todo.needsTickTickSync ? .purple : .secondary)
                    .interactiveHover(radius: 8, enabled: !state.todoSyncingIds.contains(todo.id))
                    .disabled(state.todoSyncingIds.contains(todo.id))
                }
            }
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

    private var priorityColor: Color {
        switch todo.priority {
        case "urgent": return .red
        case "high": return .orange
        case "low": return .gray
        default: return .blue
        }
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

    var canSubmit: Bool {
        !state.captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !state.captureFiles.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CaptureToolbar { action in
                state.applyMarkdown(action)
            } trailing: {
                Button {
                    Task { await state.submitCapture() }
                } label: {
                    if state.isLoading {
                        ProgressView().controlSize(.small)
                            .frame(width: 76)
                    } else {
                        Text("提交记录")
                            .font(.system(size: 13, weight: .semibold))
                            .frame(width: 76)
                    }
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.return, modifiers: .command)
                .padding(.horizontal, 14)
                .frame(height: 32)
                .background(canSubmit ? .white : .white.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(canSubmit ? .black : .secondary)
                .interactiveHover(radius: 10, enabled: canSubmit && !state.isLoading)
                .disabled(state.isLoading || !canSubmit)
                .help("提交记录（Enter）")
            }
            PasteAwareTextView(
                text: $state.captureText,
                placeholder: "输入文本或 Markdown，支持直接粘贴截图...",
                onPasteImage: { image in state.addCaptureImage(image) },
                onPasteFiles: { urls in state.addCaptureFiles(urls) },
                onSubmit: {
                    guard canSubmit && !state.isLoading else { return }
                    Task { await state.submitCapture() }
                }
            )
            .frame(minHeight: 300, maxHeight: 360)

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
                .padding(.vertical, 8)

                AttachmentDropZone(isDragging: isDragging)
                    .onTapGesture { state.chooseCaptureFiles() }
                    .onDrop(
                        of: [UTType.fileURL.identifier, UTType.image.identifier, UTType.tiff.identifier, UTType.png.identifier],
                        isTargeted: $isDragging,
                        perform: onDrop
                    )
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
            }
        }
        .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(isDragging ? Color.accentColor.opacity(0.65) : .white.opacity(0.08)))
    }
}

enum MarkdownAction: String, CaseIterable, Identifiable {
    case h1 = "H1"
    case h2 = "H2"
    case h3 = "H3"
    case bold = "B"
    case italic = "I"
    case strike = "S"
    case code = "<>"
    case list = "列表"
    case todo = "待办"
    case quote = "引用"
    case divider = "分割"

    var id: String { rawValue }

    var help: String {
        switch self {
        case .h1: return "一级标题"
        case .h2: return "二级标题"
        case .h3: return "三级标题"
        case .bold: return "加粗"
        case .italic: return "斜体"
        case .strike: return "删除线"
        case .code: return "代码"
        case .list: return "无序列表"
        case .todo: return "待办项"
        case .quote: return "引用"
        case .divider: return "分割线"
        }
    }
}

struct CaptureToolbar<Trailing: View>: View {
    let onAction: (MarkdownAction) -> Void
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 8) {
            ForEach(MarkdownAction.allCases) { item in
                Button {
                    onAction(item)
                } label: {
                    Text(item.rawValue)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(minWidth: item.rawValue.count > 2 ? 34 : 24, minHeight: 24)
                        .background(.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 7))
                }
                .buttonStyle(.plain)
                .interactiveHover(radius: 7)
                .help(item.help)
            }
            Spacer()
            Text("Markdown")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
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
        .padding(.horizontal, 18)
        .frame(minHeight: 88)
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
        scrollView.autohidesScrollers = true
        scrollView.scrollerStyle = .overlay
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
        textView.allowsUndo = true
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
        var handledAttachment = false
        if let urls = pasteboard.readObjects(
            forClasses: [NSURL.self],
            options: [.urlReadingFileURLsOnly: true]
        ) as? [URL], !urls.isEmpty {
            onPasteFiles?(urls)
            handledAttachment = true
        }
        if !handledAttachment, let image = NSImage(pasteboard: pasteboard) {
            onPasteImage?(image)
            handledAttachment = true
        }
        if let string = pasteboard.string(forType: .string), !string.isEmpty {
            insertText(string, replacementRange: selectedRange())
        } else if handledAttachment {
            needsDisplay = true
        }
    }

    override func keyDown(with event: NSEvent) {
        let enterKeys: Set<UInt16> = [36, 76]
        let hasShift = event.modifierFlags.intersection(.deviceIndependentFlagsMask).contains(.shift)
        if enterKeys.contains(event.keyCode), !hasShift {
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
            .frame(height: 30)
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
        point.y >= bounds.height - 24 ? self : nil
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
    @Environment(\.colorScheme) private var colorScheme
    @AppStorage("aixinjiTheme") private var theme = "dark"
    @AppStorage("aixinjiSidebarCollapsed") private var collapsed = false

    private var sidebarWidth: CGFloat { collapsed ? 86 : 230 }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 10) {
                if collapsed {
                    AppMark(size: 42)
                } else {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("AI 信迹")
                            .font(.system(size: 26, weight: .bold))
                        Text("知识收件箱")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: collapsed ? .center : .leading)

            VStack(alignment: .leading, spacing: 8) {
                SidebarButton(title: AppSection.capture.title, systemImage: AppSection.capture.systemImage, collapsed: collapsed, active: state.currentSection == .capture) {
                    state.currentSection = .capture
                }
                SidebarButton(title: AppSection.timeline.title, systemImage: AppSection.timeline.systemImage, collapsed: collapsed, active: state.currentSection == .timeline) {
                    state.currentSection = .timeline
                }
                SidebarButton(title: AppSection.projects.title, systemImage: AppSection.projects.systemImage, badge: state.projects.count, collapsed: collapsed, active: state.currentSection == .projects) {
                    state.currentSection = .projects
                    Task { await state.loadProjects() }
                }
                SidebarButton(title: AppSection.favorites.title, systemImage: AppSection.favorites.systemImage, badge: state.favoriteRecordIds.count, collapsed: collapsed, active: state.currentSection == .favorites) {
                    state.currentSection = .favorites
                    Task { await state.loadFavorites() }
                }
                SidebarButton(title: AppSection.todos.title, systemImage: AppSection.todos.systemImage, badge: state.todos.filter { !$0.isDone }.count, collapsed: collapsed, active: state.currentSection == .todos) {
                    state.currentSection = .todos
                    Task { await state.loadTodos() }
                }
                SidebarButton(title: AppSection.settings.title, systemImage: AppSection.settings.systemImage, collapsed: collapsed, active: state.currentSection == .settings) {
                    state.currentSection = .settings
                    Task { await state.loadSettings() }
                }
            }

            Spacer()

            VStack(alignment: .leading, spacing: 10) {
                SidebarButton(title: "打开网页版", systemImage: "safari", collapsed: collapsed, active: false) {
                    state.openWebCapture()
                }
                SidebarButton(title: "刷新同步", systemImage: "arrow.clockwise", collapsed: collapsed, active: false) {
                    Task {
                        async let timeline: Void = state.loadTimeline()
                        async let todoList: Void = state.loadTodos()
                        async let favorites: Void = state.loadFavorites()
                        async let projects: Void = state.loadProjects()
                        async let settings: Void = state.loadSettings()
                        _ = await (timeline, todoList, favorites, projects, settings)
                    }
                }
                SidebarButton(title: theme == "light" ? "切换暗色" : "切换亮色", systemImage: theme == "light" ? "moon" : "sun.max", collapsed: collapsed, active: false) {
                    withAnimation(.spring(response: 0.24, dampingFraction: 0.86)) {
                        theme = theme == "light" ? "dark" : "light"
                    }
                }
                SidebarButton(title: collapsed ? "展开菜单" : "收起菜单", systemImage: collapsed ? "sidebar.left" : "sidebar.leading", collapsed: collapsed, active: false) {
                    withAnimation(.spring(response: 0.28, dampingFraction: 0.86)) {
                        collapsed.toggle()
                    }
                }

                VStack(alignment: collapsed ? .center : .leading, spacing: 10) {
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
                    if !collapsed {
                        HStack(spacing: 8) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(state.email)
                                    .font(.footnote.weight(.semibold))
                                    .lineLimit(1)
                                Button("退出登录") { state.signOut() }
                                    .buttonStyle(.plain)
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                                    .destructiveHover(radius: 8)
                            }
                            Spacer(minLength: 4)
                            Text("v\(AppInfo.version)")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 4)
                                .background(.white.opacity(0.08), in: Capsule())
                        }
                    } else {
                        Text("v\(AppInfo.version)")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: collapsed ? .center : .leading)
                .padding(14)
                .background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.08)))
            }
        }
        .padding(22)
        .frame(width: sidebarWidth)
        .background(colorScheme == .dark ? .black.opacity(0.34) : .white.opacity(0.60))
        .animation(.spring(response: 0.28, dampingFraction: 0.86), value: collapsed)
    }
}

struct SidebarButton: View {
    @Environment(\.colorScheme) private var colorScheme
    let title: String
    let systemImage: String
    var badge: Int = 0
    var collapsed: Bool = false
    let active: Bool
    let action: () -> Void
    @State private var hovering = false

    private var fill: Color {
        if active { return colorScheme == .dark ? .white.opacity(0.11) : .black.opacity(0.065) }
        if hovering { return colorScheme == .dark ? .white.opacity(0.075) : .black.opacity(0.045) }
        return .black.opacity(0.001)
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 16, weight: active ? .semibold : .regular))
                    .frame(width: 22)
                if !collapsed {
                    Text(title)
                        .font(.system(size: 15, weight: active ? .semibold : .regular))
                        .lineLimit(1)
                    Spacer()
                }
                if badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: collapsed ? 11 : 13, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, collapsed ? 5 : 7)
                        .frame(minWidth: collapsed ? 18 : 24, minHeight: collapsed ? 18 : 22)
                        .background(.pink, in: Capsule())
                        .shadow(color: .pink.opacity(0.28), radius: 10, y: 4)
                }
            }
            .frame(maxWidth: .infinity, alignment: collapsed ? .center : .leading)
            .padding(.horizontal, collapsed ? 10 : 14)
            .padding(.vertical, 12)
            .background(fill, in: RoundedRectangle(cornerRadius: 14))
            .contentShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .shadow(color: hovering ? .black.opacity(colorScheme == .dark ? 0.28 : 0.12) : .clear, radius: hovering ? 16 : 0, y: hovering ? 8 : 0)
        .overlay(
            CursorSurface(cursor: .pointingHand, enabled: true) { inside in
                hovering = inside
                inside ? NSCursor.pointingHand.set() : NSCursor.arrow.set()
            }
        )
        .onContinuousHover { phase in
            switch phase {
            case .active:
                hovering = true
                NSCursor.pointingHand.set()
            case .ended:
                hovering = false
                NSCursor.arrow.set()
            }
        }
        .animation(.easeOut(duration: 0.08), value: hovering)
        .foregroundStyle(active ? .primary : .secondary)
        .help(title)
    }
}

struct HeaderView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.colorScheme) private var colorScheme
    let total: Int
    let filtered: Int

    private var headerFill: Color {
        colorScheme == .dark ? .black.opacity(0.20) : .white.opacity(0.64)
    }

    private var searchFill: Color {
        colorScheme == .dark ? .white.opacity(0.07) : .white.opacity(0.78)
    }

    private var borderFill: Color {
        colorScheme == .dark ? .white.opacity(0.08) : .black.opacity(0.08)
    }

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(state.currentSection.title)
                    .font(.title2.bold())
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if state.currentSection == .capture {
                Button {
                    state.setClipboardMonitoring(!state.autoClipboardEnabled)
                } label: {
                    Label(state.autoClipboardEnabled ? "监听中" : "监听剪贴板", systemImage: state.autoClipboardEnabled ? "dot.radiowaves.left.and.right" : "doc.on.clipboard")
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 12)
                        .frame(height: 34)
                }
                .buttonStyle(.plain)
                .foregroundStyle(state.autoClipboardEnabled ? Color.accentColor : .secondary)
                .background(
                    state.autoClipboardEnabled ? Color.accentColor.opacity(0.13) : searchFill,
                    in: RoundedRectangle(cornerRadius: 11)
                )
                .overlay(RoundedRectangle(cornerRadius: 11).stroke(state.autoClipboardEnabled ? Color.accentColor.opacity(0.35) : borderFill))
                .interactiveHover(radius: 11)
                .help(state.autoClipboardEnabled ? "关闭剪贴板监听" : "开启剪贴板监听")
            }
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
            .background(searchFill, in: RoundedRectangle(cornerRadius: 13))
            .overlay(RoundedRectangle(cornerRadius: 13).stroke(borderFill))

            if state.isLoading {
                ProgressView().controlSize(.small)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .background(headerFill)
        .overlay(alignment: .bottom) { Rectangle().fill(borderFill).frame(height: 1) }
    }

    private var subtitle: String {
        switch state.currentSection {
        case .capture:
            return "\(state.files.count) 个文件"
        case .timeline:
            return state.searchText.isEmpty ? "\(total) 个文件" : "\(filtered) / \(total) 个文件"
        case .projects:
            return "\(state.projects.count) 个项目"
        case .favorites:
            return "\(state.favoriteRecordIds.count) 条收藏"
        case .todos:
            let pending = state.todos.filter { !$0.isDone }.count
            return "\(pending) 条待办"
        case .settings:
            return state.settingsLoaded ? "配置已同步" : "配置未加载"
        }
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
            .background(RoundedRectangle(cornerRadius: radius).fill(Color.black.opacity(enabled ? 0.001 : 0)))
            .offset(y: enabled && hovering ? -1 : 0)
            .shadow(color: enabled && hovering ? .black.opacity(0.34) : .clear, radius: enabled && hovering ? 24 : 0, y: enabled && hovering ? 12 : 0)
            .shadow(color: enabled && hovering ? Color.accentColor.opacity(0.18) : .clear, radius: enabled && hovering ? 11 : 0, y: enabled && hovering ? 4 : 0)
            .animation(.easeOut(duration: 0.08), value: hovering)
            .contentShape(RoundedRectangle(cornerRadius: radius))
            .overlay(
                CursorSurface(cursor: .pointingHand, enabled: enabled) { inside in
                    hovering = inside
                }
            )
            .onContinuousHover { phase in
                guard enabled else { return }
                switch phase {
                case .active:
                    hovering = true
                    NSCursor.pointingHand.set()
                case .ended:
                    hovering = false
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
            .background(RoundedRectangle(cornerRadius: radius).fill(Color.black.opacity(0.001)))
            .foregroundStyle(hovering ? .white : .secondary)
            .background(hovering ? Color.red.opacity(0.92) : Color.clear, in: RoundedRectangle(cornerRadius: radius))
            .scaleEffect(hovering ? 1.04 : 1)
            .shadow(color: hovering ? .black.opacity(0.36) : .clear, radius: hovering ? 18 : 0, y: hovering ? 10 : 0)
            .contentShape(RoundedRectangle(cornerRadius: radius))
            .animation(.easeOut(duration: 0.10), value: hovering)
            .overlay(
                CursorSurface(cursor: .pointingHand, enabled: true) { inside in
                    hovering = inside
                }
            )
            .onContinuousHover { phase in
                switch phase {
                case .active:
                    hovering = true
                    NSCursor.pointingHand.set()
                case .ended:
                    hovering = false
                    NSCursor.arrow.set()
                }
            }
    }
}

struct CursorHoverModifier: ViewModifier {
    let cursor: NSCursor
    let enabled: Bool

    func body(content: Content) -> some View {
        content
            .overlay(CursorSurface(cursor: cursor, enabled: enabled) { _ in })
    }
}

struct CursorTrackingOverlay: NSViewRepresentable {
    let cursor: NSCursor
    let enabled: Bool

    func makeNSView(context: Context) -> CursorTrackingView {
        let view = CursorTrackingView()
        view.cursor = cursor
        view.enabled = enabled
        return view
    }

    func updateNSView(_ nsView: CursorTrackingView, context: Context) {
        nsView.cursor = cursor
        nsView.enabled = enabled
        nsView.resetCursorRects()
    }
}

struct CursorSurface: NSViewRepresentable {
    let cursor: NSCursor
    let enabled: Bool
    let onHover: (Bool) -> Void

    func makeNSView(context: Context) -> CursorSurfaceView {
        let view = CursorSurfaceView()
        view.cursor = cursor
        view.enabled = enabled
        view.onHover = onHover
        return view
    }

    func updateNSView(_ nsView: CursorSurfaceView, context: Context) {
        nsView.cursor = cursor
        nsView.enabled = enabled
        nsView.onHover = onHover
        nsView.updateTrackingAreas()
        nsView.resetCursorRects()
    }
}

final class CursorSurfaceView: NSView {
    var cursor: NSCursor = .pointingHand
    var enabled = true
    var onHover: ((Bool) -> Void)?
    private var trackingArea: NSTrackingArea?

    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }

    override func updateTrackingAreas() {
        if let trackingArea {
            removeTrackingArea(trackingArea)
        }
        let area = NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        trackingArea = area
        addTrackingArea(area)
        super.updateTrackingAreas()
    }

    override func resetCursorRects() {
        super.resetCursorRects()
        guard enabled else { return }
        addCursorRect(bounds, cursor: cursor)
    }

    override func mouseEntered(with event: NSEvent) {
        guard enabled else { return }
        cursor.set()
        onHover?(true)
    }

    override func mouseExited(with event: NSEvent) {
        guard enabled else { return }
        NSCursor.arrow.set()
        onHover?(false)
    }
}

struct SplitDragSurface: NSViewRepresentable {
    let cursor: NSCursor
    let onHover: (Bool) -> Void
    let onDraggingChanged: (Bool) -> Void
    let onTranslation: (CGFloat) -> Void

    func makeNSView(context: Context) -> SplitDragSurfaceView {
        let view = SplitDragSurfaceView()
        view.cursor = cursor
        view.onHover = onHover
        view.onDraggingChanged = onDraggingChanged
        view.onTranslation = onTranslation
        return view
    }

    func updateNSView(_ nsView: SplitDragSurfaceView, context: Context) {
        nsView.cursor = cursor
        nsView.onHover = onHover
        nsView.onDraggingChanged = onDraggingChanged
        nsView.onTranslation = onTranslation
        nsView.updateTrackingAreas()
        nsView.resetCursorRects()
    }
}

final class SplitDragSurfaceView: NSView {
    var cursor: NSCursor = .resizeLeftRight
    var onHover: ((Bool) -> Void)?
    var onDraggingChanged: ((Bool) -> Void)?
    var onTranslation: ((CGFloat) -> Void)?
    private var trackingArea: NSTrackingArea?
    private var dragStartLocation: NSPoint?
    private var previousMovableByWindowBackground: Bool?

    override var acceptsFirstResponder: Bool { true }

    override func hitTest(_ point: NSPoint) -> NSView? {
        bounds.contains(point) ? self : nil
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }

    override func updateTrackingAreas() {
        if let trackingArea {
            removeTrackingArea(trackingArea)
        }
        let area = NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        trackingArea = area
        addTrackingArea(area)
        super.updateTrackingAreas()
    }

    override func resetCursorRects() {
        super.resetCursorRects()
        addCursorRect(bounds, cursor: cursor)
    }

    override func mouseEntered(with event: NSEvent) {
        cursor.set()
        onHover?(true)
    }

    override func mouseExited(with event: NSEvent) {
        if dragStartLocation == nil {
            NSCursor.arrow.set()
            onHover?(false)
        }
    }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        previousMovableByWindowBackground = window?.isMovableByWindowBackground
        window?.isMovableByWindowBackground = false
        dragStartLocation = window?.mouseLocationOutsideOfEventStream ?? event.locationInWindow
        cursor.set()
        onHover?(true)
        onDraggingChanged?(true)
    }

    override func mouseDragged(with event: NSEvent) {
        let current = window?.mouseLocationOutsideOfEventStream ?? event.locationInWindow
        if let start = dragStartLocation {
            let translation = current.x - start.x
            onTranslation?(translation)
        }
        cursor.set()
    }

    override func mouseUp(with event: NSEvent) {
        dragStartLocation = nil
        if let previousMovableByWindowBackground {
            window?.isMovableByWindowBackground = previousMovableByWindowBackground
        }
        previousMovableByWindowBackground = nil
        let point = convert(event.locationInWindow, from: nil)
        let inside = bounds.contains(point)
        onDraggingChanged?(false)
        onHover?(inside)
        inside ? cursor.set() : NSCursor.arrow.set()
    }
}

final class CursorTrackingView: NSView {
    var cursor: NSCursor = .pointingHand
    var enabled = true {
        didSet { resetCursorRects() }
    }

    override var acceptsFirstResponder: Bool { false }

    override func hitTest(_ point: NSPoint) -> NSView? {
        nil
    }

    override func resetCursorRects() {
        super.resetCursorRects()
        guard enabled else { return }
        addCursorRect(bounds, cursor: cursor)
    }
}

extension View {
    func interactiveHover(radius: CGFloat = 12, enabled: Bool = true) -> some View {
        modifier(InteractiveHoverModifier(radius: radius, enabled: enabled))
    }

    func destructiveHover(radius: CGFloat = 10) -> some View {
        modifier(DestructiveHoverModifier(radius: radius))
    }

    func cursorHover(_ cursor: NSCursor = .pointingHand, enabled: Bool = true) -> some View {
        modifier(CursorHoverModifier(cursor: cursor, enabled: enabled))
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
