import SwiftUI

@main
struct AIXinjiMacApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(state)
                .frame(minWidth: 980, minHeight: 680)
                .task { await state.bootstrap() }
        }
        .windowStyle(.hiddenTitleBar)
    }
}

struct ContentView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        ZStack {
            Color(nsColor: .windowBackgroundColor).ignoresSafeArea()
            if state.isSignedIn {
                TimelineView()
            } else {
                LoginView()
            }
        }
    }
}

struct LoginView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        VStack(spacing: 18) {
            Text("AI 信迹")
                .font(.system(size: 36, weight: .bold))
                .foregroundStyle(.purple)
            Text("原生 Mac 客户端")
                .foregroundStyle(.secondary)
            TextField("邮箱", text: $state.email)
                .textFieldStyle(.roundedBorder)
                .frame(width: 360)
            SecureField("密码", text: $state.password)
                .textFieldStyle(.roundedBorder)
                .frame(width: 360)
            Button(state.isLoading ? "登录中..." : "登录") {
                Task { await state.signIn() }
            }
            .keyboardShortcut(.defaultAction)
            .buttonStyle(.borderedProminent)
            .disabled(state.isLoading)
            if !state.message.isEmpty {
                Text(state.message)
                    .foregroundStyle(.red)
                    .font(.footnote)
                    .frame(width: 420)
            }
        }
        .padding(40)
    }
}

struct TimelineView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        NavigationSplitView {
            VStack(alignment: .leading, spacing: 14) {
                Text("AI 信迹")
                    .font(.title.bold())
                Text(state.email)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Divider()
                Button("刷新文件时间线") {
                    Task { await state.loadTimeline() }
                }
                Button("退出登录") {
                    state.signOut()
                }
                .foregroundStyle(.red)
                Spacer()
            }
            .padding(20)
            .frame(minWidth: 220)
        } detail: {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    VStack(alignment: .leading) {
                        Text("文件时间线")
                            .font(.title2.bold())
                        Text("\(state.files.count) 个文件")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    if state.isLoading {
                        ProgressView()
                    }
                }
                .padding(20)

                if !state.message.isEmpty {
                    Text(state.message)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 20)
                }

                List(state.files) { file in
                    FileRow(file: file)
                }
                .listStyle(.inset)
            }
        }
    }
}

struct FileRow: View {
    let file: FileTimelineItem

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(file.originalName)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
                Text(formatBytes(file.byteSize))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(file.description.isEmpty ? (file.recordSummary.isEmpty ? "暂无描述" : file.recordSummary) : file.description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            HStack {
                Text(file.recordTitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("打开") {
                    openAsset(file.id)
                }
            }
        }
        .padding(.vertical, 8)
    }

    private func openAsset(_ id: String) {
        let base = ProcessInfo.processInfo.environment["AI_XINJI_API_BASE_URL"] ?? "https://aixinji.linknewai.com"
        if let url = URL(string: "\(base)/api/assets/\(id)") {
            NSWorkspace.shared.open(url)
        }
    }

    private func formatBytes(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / 1024 / 1024)
    }
}
