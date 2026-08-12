import Foundation
import AppKit

@MainActor
final class AppState: ObservableObject {
    @Published var email = ""
    @Published var password = ""
    @Published var accessToken = ""
    @Published var files: [FileTimelineItem] = []
    @Published var selectedFileId: String?
    @Published var searchText = ""
    @Published var captureTitle = ""
    @Published var captureTags = ""
    @Published var captureProjectId = ""
    @Published var captureProjectQuery = ""
    @Published var captureContextNote = ""
    @Published var captureText = ""
    @Published var captureSource = "Mac 录入"
    @Published var captureFiles: [CaptureAttachment] = []
    @Published var autoClipboardEnabled = false
    @Published var autoCreateTodo = true
    @Published var forceLinkToTodo = false
    @Published var enableAiSummary = true
    @Published var enableOcr = true
    @Published var syncToNotion = true
    @Published var syncToFlomo = false
    @Published var rememberPassword = false
    @Published var lastClipboardText = ""
    @Published var message = ""
    @Published var isLoading = false
    @Published var currentSection: AppSection = .timeline
    @Published var favoriteRecordIds: Set<String> = []
    @Published var favoriteRecords: [KnowledgeRecord] = []
    @Published var pinnedFavoriteIds: [String] = []
    @Published var projects: [Project] = []
    @Published var previewImages: [String: NSImage] = [:]
    @Published var previewLoadingIds: Set<String> = []
    @Published var todos: [TodoItem] = []
    @Published var todoSyncingIds: Set<String> = []
    @Published var todoBatchSyncing = false
    @Published var avatarImage: NSImage?
    @Published var settings = IntegrationSettings.defaults
    @Published var settingsLoaded = false

    var isSignedIn: Bool { !accessToken.isEmpty }
    var selectedFile: FileTimelineItem? {
        get {
            guard let selectedFileId else { return nil }
            return files.first { $0.id == selectedFileId }
        }
        set { selectedFileId = newValue?.id }
    }
    var selectedCaptureProject: Project? {
        guard !captureProjectId.isEmpty else { return nil }
        return projects.first { $0.id == captureProjectId }
    }

    private let apiBaseURL: URL
    private let supabaseURL: URL?
    private let supabaseAnonKey: String
    private let tokenAccount = "supabase-access-token"
    private let emailAccount = "last-email"
    private let passwordAccount = "saved-password"
    private let rememberAccount = "remember-password"
    private let pinnedFavoritesKey = "favorites-pinned-ids"
    private var clipboardTimer: Timer?

    init() {
        let bundle = Bundle.main
        let env = ProcessInfo.processInfo.environment
        let apiBase = env["AI_XINJI_API_BASE_URL"]
            ?? bundle.object(forInfoDictionaryKey: "AIXinjiAPIBaseURL") as? String
            ?? "https://aixinji.linknewai.com"
        let supabase = env["AI_XINJI_SUPABASE_URL"]
            ?? bundle.object(forInfoDictionaryKey: "AIXinjiSupabaseURL") as? String
            ?? ""
        let anon = env["AI_XINJI_SUPABASE_ANON_KEY"]
            ?? bundle.object(forInfoDictionaryKey: "AIXinjiSupabaseAnonKey") as? String
            ?? ""

        apiBaseURL = URL(string: apiBase) ?? URL(string: "https://aixinji.linknewai.com")!
        supabaseURL = URL(string: supabase)
        supabaseAnonKey = anon
        accessToken = KeychainStore.read(account: tokenAccount)
        email = KeychainStore.read(account: emailAccount)
        rememberPassword = KeychainStore.read(account: rememberAccount) == "true"
        if rememberPassword {
            password = KeychainStore.read(account: passwordAccount)
        }
        pinnedFavoriteIds = UserDefaults.standard.stringArray(forKey: pinnedFavoritesKey) ?? []
        avatarImage = loadSavedAvatar()
    }

    func bootstrap() async {
        if isSignedIn {
            async let timeline: Void = loadTimeline()
            async let todoList: Void = loadTodos()
            async let config: Void = loadSettings()
            async let projectList: Void = loadProjects()
            _ = await (timeline, todoList, config, projectList)
        }
    }

    func setClipboardMonitoring(_ enabled: Bool) {
        autoClipboardEnabled = enabled
        clipboardTimer?.invalidate()
        clipboardTimer = nil
        if enabled {
            lastClipboardText = NSPasteboard.general.string(forType: .string) ?? ""
            clipboardTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    self?.captureClipboardIfNeeded()
                }
            }
            message = "已开启剪贴板监听"
        } else {
            message = "已关闭剪贴板监听"
        }
    }

    func captureClipboardNow() {
        let pasteboard = NSPasteboard.general
        var importedCount = 0
        if let urls = pasteboard.readObjects(
            forClasses: [NSURL.self],
            options: [.urlReadingFileURLsOnly: true]
        ) as? [URL], !urls.isEmpty {
            addCaptureFiles(urls)
            importedCount += urls.count
        }
        if let image = NSImage(pasteboard: pasteboard), let attachment = makeCaptureAttachment(from: image) {
            addCaptureAttachments([attachment])
            importedCount += 1
        }

        let text = pasteboard.string(forType: .string) ?? ""
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            appendCaptureText(text)
            lastClipboardText = text
        }

        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || importedCount > 0 else {
            message = "剪贴板没有可录入内容"
            return
        }

        if looksLikeTodo(text) {
            autoCreateTodo = true
            message = importedCount > 0 ? "已读取剪贴板，包含附件和待办线索" : "已读取剪贴板，疑似待办"
        } else {
            message = importedCount > 0 ? "已读取剪贴板，已添加 \(importedCount) 个附件" : "已读取剪贴板"
        }
    }

    private func captureClipboardIfNeeded() {
        guard autoClipboardEnabled else { return }
        let text = NSPasteboard.general.string(forType: .string) ?? ""
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, text != lastClipboardText else { return }
        lastClipboardText = text
        appendCaptureText(text)
        if looksLikeTodo(text) {
            autoCreateTodo = true
            message = "剪贴板已捕获，识别为待办线索"
        } else {
            message = "剪贴板已捕获"
        }
    }

    func signIn() async {
        guard !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !password.isEmpty else {
            message = "请填写邮箱和密码"
            return
        }
        guard let supabaseURL, !supabaseAnonKey.isEmpty else {
            message = "App 缺少 Supabase 公共配置，请重新安装最新版"
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            var request = URLRequest(url: supabaseURL.appending(path: "/auth/v1/token"))
            request.httpMethod = "POST"
            request.setValue(supabaseAnonKey, forHTTPHeaderField: "apikey")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.url?.append(queryItems: [URLQueryItem(name: "grant_type", value: "password")])
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "email": email.trimmingCharacters(in: .whitespacesAndNewlines),
                "password": password
            ])

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "登录失败"
                return
            }

            let auth = try JSONDecoder.aixinji.decode(AuthResponse.self, from: data)
            accessToken = auth.accessToken
            email = auth.user.email ?? email
            KeychainStore.save(accessToken, account: tokenAccount)
            KeychainStore.save(email, account: emailAccount)
            if rememberPassword {
                KeychainStore.save(password, account: passwordAccount)
                KeychainStore.save("true", account: rememberAccount)
            } else {
                KeychainStore.delete(account: passwordAccount)
                KeychainStore.delete(account: rememberAccount)
            }
            message = ""
            async let timeline: Void = loadTimeline()
            async let todoList: Void = loadTodos()
            async let config: Void = loadSettings()
            async let projectList: Void = loadProjects()
            _ = await (timeline, todoList, config, projectList)
        } catch {
            message = error.localizedDescription
        }
    }

    func signOut() {
        accessToken = ""
        if rememberPassword {
            password = KeychainStore.read(account: passwordAccount)
        } else {
            password = ""
            KeychainStore.delete(account: passwordAccount)
            KeychainStore.delete(account: rememberAccount)
        }
        files = []
        todos = []
        favoriteRecords = []
        projects = []
        selectedFileId = nil
        favoriteRecordIds = []
        captureProjectId = ""
        captureProjectQuery = ""
        previewImages = [:]
        previewLoadingIds = []
        todoSyncingIds = []
        todoBatchSyncing = false
        KeychainStore.delete(account: tokenAccount)
        setClipboardMonitoring(false)
    }

    func submitCapture() async {
        let text = captureText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !captureFiles.isEmpty else {
            message = "请先输入内容或选择文件"
            return
        }
        guard !accessToken.isEmpty else { return }

        isLoading = true
        defer { isLoading = false }

        do {
            let boundary = "AIXinjiBoundary\(UUID().uuidString)"
            var body = Data()
            func appendField(_ name: String, _ value: String) {
                body.append("--\(boundary)\r\n".data(using: .utf8)!)
                body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
                body.append("\(value)\r\n".data(using: .utf8)!)
            }
            func appendFile(_ attachment: CaptureAttachment) throws {
                let data = try Data(contentsOf: attachment.url)
                body.append("--\(boundary)\r\n".data(using: .utf8)!)
                body.append("Content-Disposition: form-data; name=\"files\"; filename=\"\(escapeMultipartValue(attachment.name))\"\r\n".data(using: .utf8)!)
                body.append("Content-Type: \(attachment.mimeType)\r\n\r\n".data(using: .utf8)!)
                body.append(data)
                body.append("\r\n".data(using: .utf8)!)
            }

            appendField("title", captureTitleValue(from: text, files: captureFiles))
            appendField("sourceLabel", captureSource.isEmpty ? "Mac 录入" : captureSource)
            appendField("contextNote", captureContextValue())
            appendField("contentText", text)
            appendField("userTags", captureTags)
            appendField("recordTypeHint", captureFiles.isEmpty ? "text" : "")
            appendField("enableAiSummary", enableAiSummary ? "true" : "false")
            appendField("enableAiTodo", autoCreateTodo ? "true" : "false")
            appendField("enableOcr", enableOcr ? "true" : "false")
            appendField("linkToTodo", forceLinkToTodo ? "true" : "false")
            appendField("syncToNotion", syncToNotion ? "true" : "false")
            appendField("syncToFlomo", syncToFlomo ? "true" : "false")
            for (index, attachment) in captureFiles.enumerated() {
                appendField("fileTags_\(index)", attachment.tags)
                appendField("fileDesc_\(index)", attachment.note)
                try appendFile(attachment)
            }
            body.append("--\(boundary)--\r\n".data(using: .utf8)!)

            var request = authorizedRequest(path: "/api/records")
            request.httpMethod = "POST"
            request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "录入失败"
                return
            }
            _ = try? JSONDecoder.aixinji.decode(CreateRecordResponse.self, from: data)
            captureTitle = ""
            captureTags = ""
            captureContextNote = ""
            captureText = ""
            captureFiles = []
            message = "已录入并同步"
            async let timeline: Void = loadTimeline()
            async let todoList: Void = loadTodos()
            async let favorites: Void = loadFavorites()
            async let projectList: Void = loadProjects()
            _ = await (timeline, todoList, favorites, projectList)
            currentSection = .timeline
        } catch {
            message = "录入失败：\(error.localizedDescription)"
        }
    }

    func chooseCaptureFiles() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.canCreateDirectories = false
        if panel.runModal() == .OK {
            let incoming = panel.urls.map(CaptureAttachment.make)
            addCaptureAttachments(incoming)
            if captureSource.isEmpty { captureSource = "Mac 录入" }
            message = incoming.isEmpty ? "" : "已选择 \(incoming.count) 个文件"
        }
    }

    func addCaptureFiles(_ urls: [URL]) {
        addCaptureAttachments(urls.map(CaptureAttachment.make))
    }

    func addCaptureImage(_ image: NSImage) {
        guard let attachment = makeCaptureAttachment(from: image) else {
            message = "图片读取失败"
            return
        }
        addCaptureAttachments([attachment])
        message = "已添加截图"
    }

    private func addCaptureAttachments(_ incoming: [CaptureAttachment]) {
        var merged = captureFiles
        for item in incoming where !merged.contains(where: { $0.url == item.url }) {
            merged.append(item)
        }
        captureFiles = merged
    }

    func updateCaptureFile(_ attachment: CaptureAttachment, tags: String? = nil, note: String? = nil) {
        guard let index = captureFiles.firstIndex(where: { $0.id == attachment.id }) else { return }
        if let tags { captureFiles[index].tags = tags }
        if let note { captureFiles[index].note = note }
    }

    func removeCaptureFile(_ attachment: CaptureAttachment) {
        captureFiles.removeAll { $0.id == attachment.id }
    }

    func loadTimeline() async {
        guard !accessToken.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            let request = authorizedRequest(
                path: "/api/files/timeline",
                queryItems: [
                    URLQueryItem(name: "limit", value: "200"),
                    URLQueryItem(name: "offset", value: "0")
                ]
            )
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                if (response as? HTTPURLResponse)?.statusCode == 401 {
                    signOut()
                    message = "登录已过期，请重新登录"
                    return
                }
                message = readableError(data) ?? "读取失败"
                return
            }
            files = try JSONDecoder.aixinji.decode(FileTimelineResponse.self, from: data).files
            if selectedFileId == nil || !files.contains(where: { $0.id == selectedFileId }) {
                selectedFileId = files.first?.id
            }
            message = ""
            await loadFavorites()
            preloadVisibleImagePreviews()
        } catch {
            message = error.localizedDescription
        }
    }

    func loadTodos() async {
        guard !accessToken.isEmpty else { return }
        do {
            async let pending = fetchTodos(status: "pending")
            async let done = fetchTodos(status: "done")
            let (pendingItems, doneItems) = try await (pending, done)
            let combined = pendingItems + doneItems
            todos = combined.sorted { $0.createdAt > $1.createdAt }
        } catch {
            message = "读取待办失败：\(error.localizedDescription)"
        }
    }

    func syncTodoToTickTick(_ todo: TodoItem) async {
        guard !accessToken.isEmpty, !todo.id.hasPrefix("local_todo_") else { return }
        todoSyncingIds.insert(todo.id)
        defer { todoSyncingIds.remove(todo.id) }
        do {
            var request = authorizedRequest(path: "/api/todos/\(todo.id)/sync")
            request.httpMethod = "POST"
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "同步滴答失败"
                return
            }
            if let result = try? JSONDecoder.aixinji.decode(TodoSyncResponse.self, from: data),
               let changed = result.todo,
               let index = todos.firstIndex(where: { $0.id == todo.id }) {
                todos[index] = changed
                message = result.message ?? "已同步到滴答清单"
            } else {
                await loadTodos()
                message = "已同步到滴答清单"
            }
        } catch {
            message = "同步滴答失败：\(error.localizedDescription)"
        }
    }

    func syncTodosBatchToTickTick(_ ids: [String]) async {
        let cleanIds = ids.filter { !$0.hasPrefix("local_todo_") }
        guard !accessToken.isEmpty, !cleanIds.isEmpty else { return }
        todoBatchSyncing = true
        defer { todoBatchSyncing = false }
        do {
            var request = authorizedRequest(path: "/api/todos/sync-batch")
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["ids": cleanIds])
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "批量同步滴答失败"
                return
            }
            let result = try? JSONDecoder.aixinji.decode(TodoBatchSyncResponse.self, from: data)
            await loadTodos()
            message = result?.message ?? "滴答清单同步完成"
        } catch {
            message = "批量同步滴答失败：\(error.localizedDescription)"
        }
    }

    func loadSettings() async {
        guard !accessToken.isEmpty else { return }
        do {
            let request = authorizedRequest(path: "/api/settings")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "读取设置失败"
                return
            }
            settings = try JSONDecoder.aixinji.decode(SettingsResponse.self, from: data).settings
            settingsLoaded = true
        } catch {
            message = "读取设置失败：\(error.localizedDescription)"
        }
    }

    func loadProjects() async {
        guard !accessToken.isEmpty else { return }
        do {
            let request = authorizedRequest(path: "/api/projects")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "读取项目失败"
                return
            }
            let list = try JSONDecoder.aixinji.decode(ProjectsResponse.self, from: data).projects
            projects = list.sorted { lhs, rhs in
                if lhs.archived != rhs.archived { return !lhs.archived }
                if lhs.sortOrder != rhs.sortOrder { return lhs.sortOrder < rhs.sortOrder }
                return lhs.createdAt > rhs.createdAt
            }
            if !captureProjectId.isEmpty, let selected = projects.first(where: { $0.id == captureProjectId }) {
                captureProjectQuery = selected.name
            } else if !captureProjectId.isEmpty {
                captureProjectId = ""
                captureProjectQuery = ""
            }
        } catch {
            message = "读取项目失败：\(error.localizedDescription)"
        }
    }

    func createProject(name: String, description: String = "") async {
        let projectName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !projectName.isEmpty, !accessToken.isEmpty else { return }
        do {
            var request = authorizedRequest(path: "/api/projects")
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "name": projectName,
                "description": description.trimmingCharacters(in: .whitespacesAndNewlines)
            ])
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "创建项目失败"
                return
            }
            if let project = try? JSONDecoder.aixinji.decode(ProjectMutationResponse.self, from: data).project {
                projects.removeAll { $0.id == project.id }
                projects.insert(project, at: 0)
                captureProjectId = project.id
                captureProjectQuery = project.name
                message = "项目已创建并关联"
            } else {
                await loadProjects()
                message = "项目已创建"
            }
        } catch {
            message = "创建项目失败：\(error.localizedDescription)"
        }
    }

    func saveSettings() async {
        guard !accessToken.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            var request = authorizedRequest(path: "/api/settings")
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(settings)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "保存设置失败"
                return
            }
            settings = try JSONDecoder.aixinji.decode(SettingsResponse.self, from: data).settings
            settingsLoaded = true
            message = "设置已保存"
        } catch {
            message = "保存设置失败：\(error.localizedDescription)"
        }
    }

    func testIntegration(_ target: String) async {
        guard !accessToken.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            var request = authorizedRequest(path: "/api/integrations")
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var body: [String: String] = ["target": target]
            if target == "flomo" {
                body["webhookUrl"] = settings.flomoWebhookUrl
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "连接测试失败"
                return
            }
            let result = try? JSONDecoder.aixinji.decode(IntegrationTestResponse.self, from: data)
            message = result?.message ?? "连接测试通过"
        } catch {
            message = "连接测试失败：\(error.localizedDescription)"
        }
    }

    private func fetchTodos(status: String) async throws -> [TodoItem] {
        let request = authorizedRequest(
            path: "/api/todos",
            queryItems: [
                URLQueryItem(name: "limit", value: "200"),
                URLQueryItem(name: "status", value: status)
            ]
        )
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw NSError(domain: "AIXinjiMac", code: 2, userInfo: [
                NSLocalizedDescriptionKey: readableError(data) ?? "服务器返回异常"
            ])
        }
        return try JSONDecoder.aixinji.decode(TodoListResponse.self, from: data).todos
    }

    func createTodo(content: String, priority: String) async {
        let value = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        do {
            var request = authorizedRequest(path: "/api/todos")
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["content": value, "priority": priority])
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "新增待办失败"
                return
            }
            await loadTodos()
            message = "待办已添加"
        } catch {
            message = "新增待办失败：\(error.localizedDescription)"
        }
    }

    func toggleTodo(_ todo: TodoItem) async {
        await updateTodo(todo, fields: ["status": todo.isDone ? "pending" : "done"])
    }

    func updateTodoPriority(_ todo: TodoItem, priority: String) async {
        await updateTodo(todo, fields: ["priority": priority])
    }

    func deleteTodo(_ todo: TodoItem) async {
        do {
            var request = authorizedRequest(path: "/api/todos/\(todo.id)")
            request.httpMethod = "DELETE"
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "删除待办失败"
                return
            }
            todos.removeAll { $0.id == todo.id }
            message = "待办已移入回收站"
        } catch {
            message = "删除待办失败：\(error.localizedDescription)"
        }
    }

    private func updateTodo(_ todo: TodoItem, fields: [String: String]) async {
        do {
            var request = authorizedRequest(path: "/api/todos/\(todo.id)")
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: fields)
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "更新待办失败"
                return
            }
            if let changed = try JSONDecoder.aixinji.decode(TodoMutationResponse.self, from: data).todo,
               let index = todos.firstIndex(where: { $0.id == todo.id }) {
                todos[index] = changed
            } else {
                await loadTodos()
            }
        } catch {
            message = "更新待办失败：\(error.localizedDescription)"
        }
    }

    func chooseAvatar() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg, .heic, .image]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url, let image = NSImage(contentsOf: url) else { return }
        do {
            let data = try Data(contentsOf: url)
            try FileManager.default.createDirectory(at: avatarDirectory, withIntermediateDirectories: true)
            try data.write(to: avatarURL, options: .atomic)
            avatarImage = image
            message = "头像已更新"
        } catch {
            message = "头像保存失败：\(error.localizedDescription)"
        }
    }

    private var avatarDirectory: URL {
        (FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? FileManager.default.temporaryDirectory)
            .appending(path: "AI-Xinji-Mac", directoryHint: .isDirectory)
    }

    private var avatarURL: URL { avatarDirectory.appending(path: "avatar") }

    private func loadSavedAvatar() -> NSImage? { NSImage(contentsOf: avatarURL) }

    func loadFavorites() async {
        guard !accessToken.isEmpty else { return }
        do {
            let request = authorizedRequest(path: "/api/favorites")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return
            }
            let result = try JSONDecoder.aixinji.decode(FavoriteTimelineResponse.self, from: data)
            favoriteRecords = result.records
            favoriteRecordIds = Set(result.records.map(\.id))
            pinnedFavoriteIds = pinnedFavoriteIds.filter { favoriteRecordIds.contains($0) }
            savePinnedFavorites()
        } catch {
            return
        }
    }

    func toggleFavorite(_ file: FileTimelineItem) async {
        guard !accessToken.isEmpty else { return }
        let wasFavorite = favoriteRecordIds.contains(file.recordId)
        if wasFavorite {
            favoriteRecordIds.remove(file.recordId)
        } else {
            favoriteRecordIds.insert(file.recordId)
        }

        do {
            var request: URLRequest
            if wasFavorite {
                request = authorizedRequest(path: "/api/favorites/\(file.recordId)")
                request.httpMethod = "DELETE"
            } else {
                request = authorizedRequest(path: "/api/favorites")
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = try JSONSerialization.data(withJSONObject: ["recordId": file.recordId])
            }

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                if wasFavorite {
                    favoriteRecordIds.insert(file.recordId)
                } else {
                    favoriteRecordIds.remove(file.recordId)
                }
                message = readableError(data) ?? "收藏同步失败"
                return
            }
            if wasFavorite {
                favoriteRecords.removeAll { $0.id == file.recordId }
                pinnedFavoriteIds.removeAll { $0 == file.recordId }
                savePinnedFavorites()
            } else {
                await loadFavorites()
            }
            message = wasFavorite ? "已取消收藏" : "已收藏"
        } catch {
            if wasFavorite {
                favoriteRecordIds.insert(file.recordId)
            } else {
                favoriteRecordIds.remove(file.recordId)
            }
            message = "收藏同步失败：\(error.localizedDescription)"
        }
    }

    func removeFavoriteRecord(_ record: KnowledgeRecord) async {
        guard !accessToken.isEmpty else { return }
        favoriteRecords.removeAll { $0.id == record.id }
        favoriteRecordIds.remove(record.id)
        pinnedFavoriteIds.removeAll { $0 == record.id }
        savePinnedFavorites()
        do {
            var request = authorizedRequest(path: "/api/favorites/\(record.id)")
            request.httpMethod = "DELETE"
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = readableError(data) ?? "取消收藏失败"
                await loadFavorites()
                return
            }
            message = "已取消收藏"
        } catch {
            message = "取消收藏失败：\(error.localizedDescription)"
            await loadFavorites()
        }
    }

    func togglePinnedFavorite(_ record: KnowledgeRecord) {
        if pinnedFavoriteIds.contains(record.id) {
            pinnedFavoriteIds.removeAll { $0 == record.id }
            message = "已取消置顶"
        } else {
            pinnedFavoriteIds.removeAll { $0 == record.id }
            pinnedFavoriteIds.insert(record.id, at: 0)
            message = "已置顶"
        }
        savePinnedFavorites()
    }

    private func savePinnedFavorites() {
        UserDefaults.standard.set(pinnedFavoriteIds, forKey: pinnedFavoritesKey)
    }

    func loadPreview(for file: FileTimelineItem) async {
        await loadPreview(assetId: file.id, mimeType: file.mimeType)
    }

    func loadPreview(for asset: RecordAsset) async {
        await loadPreview(assetId: asset.id, mimeType: asset.mimeType)
    }

    private func loadPreview(assetId: String, mimeType: String) async {
        guard mimeType.hasPrefix("image/"), previewImages[assetId] == nil, !previewLoadingIds.contains(assetId) else {
            return
        }
        if let cached = cachedPreviewImage(assetId: assetId) {
            previewImages[assetId] = cached
            return
        }
        previewLoadingIds.insert(assetId)
        defer { previewLoadingIds.remove(assetId) }

        do {
            let thumbData = try await fetchAssetData(assetId: assetId, thumbnail: true)
            if let image = NSImage(data: thumbData) {
                previewImages[assetId] = image
                writePreviewCache(thumbData, assetId: assetId)
                return
            }
            let originalData = try await fetchAssetData(assetId: assetId, thumbnail: false)
            if let image = NSImage(data: originalData) {
                previewImages[assetId] = image
                writePreviewCache(originalData, assetId: assetId)
            }
        } catch {
            return
        }
    }

    func copyShareLink(_ file: FileTimelineItem) {
        let url = apiBaseURL.appending(path: "/api/assets/\(file.id)").absoluteString
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url, forType: .string)
        message = "链接已复制"
    }

    func copyShareLink(_ asset: RecordAsset) {
        let url = apiBaseURL.appending(path: "/api/assets/\(asset.id)").absoluteString
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url, forType: .string)
        message = "链接已复制"
    }

    func openWebCapture() {
        NSWorkspace.shared.open(apiBaseURL)
    }

    func openRecordInWeb(_ record: KnowledgeRecord) {
        NSWorkspace.shared.open(webURL(queryItems: [
            URLQueryItem(name: "tab", value: "history"),
            URLQueryItem(name: "record", value: record.id)
        ]))
    }

    func openProjectInWeb(_ project: Project) {
        NSWorkspace.shared.open(webURL(queryItems: [
            URLQueryItem(name: "tab", value: "projects"),
            URLQueryItem(name: "project", value: project.id)
        ]))
    }

    private func captureTitleValue(from text: String, files: [CaptureAttachment] = []) -> String {
        let manualTitle = captureTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !manualTitle.isEmpty { return manualTitle }
        let oneLine = text.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        if !oneLine.isEmpty { return String(oneLine.prefix(32)) }
        if let first = files.first { return first.name }
        return "Mac 录入"
    }

    private func captureContextValue() -> String {
        var parts: [String] = []
        if let project = selectedCaptureProject {
            parts.append("关联项目：\(project.name)")
        } else {
            let query = captureProjectQuery.trimmingCharacters(in: .whitespacesAndNewlines)
            if !query.isEmpty {
                parts.append("关联项目：\(query)")
            }
        }
        let note = captureContextNote.trimmingCharacters(in: .whitespacesAndNewlines)
        if !note.isEmpty {
            parts.append(note)
        }
        return parts.joined(separator: "\n")
    }

    private func escapeMultipartValue(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
    }

    func looksLikeTodo(_ text: String) -> Bool {
        let keywords = ["待办", "提醒", "明天", "今天", "今晚", "本周", "下周", "确认", "跟进", "回复", "提交", "安排", "处理", "完成", "联系", "开会", "前"]
        return keywords.contains { text.localizedCaseInsensitiveContains($0) }
    }

    func appendCaptureText(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if captureText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            captureText = text
        } else {
            captureText += "\n" + text
        }
    }

    private func looksUrgent(_ text: String) -> Bool {
        ["今天", "今晚", "马上", "紧急", "尽快", "明早"].contains { text.localizedCaseInsensitiveContains($0) }
    }

    func openAsset(_ file: FileTimelineItem) async {
        do {
            let localURL = try await fetchAssetToTemporaryFile(assetId: file.id, originalName: file.originalName)
            NSWorkspace.shared.open(localURL)
            message = "已打开"
        } catch {
            message = "打开失败：\(error.localizedDescription)"
        }
    }

    func openAsset(_ asset: RecordAsset) async {
        do {
            let localURL = try await fetchAssetToTemporaryFile(assetId: asset.id, originalName: asset.originalName)
            NSWorkspace.shared.open(localURL)
            message = "已打开"
        } catch {
            message = "打开失败：\(error.localizedDescription)"
        }
    }

    func downloadAsset(_ file: FileTimelineItem) async {
        do {
            let localURL = try await fetchAssetToTemporaryFile(assetId: file.id, originalName: file.originalName)
            let panel = NSSavePanel()
            panel.nameFieldStringValue = file.originalName
            panel.canCreateDirectories = true
            let response = await panel.begin()
            guard response == .OK, let destination = panel.url else { return }
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: localURL, to: destination)
            message = "已保存到本地"
        } catch {
            message = "下载失败：\(error.localizedDescription)"
        }
    }

    func downloadAsset(_ asset: RecordAsset) async {
        do {
            let localURL = try await fetchAssetToTemporaryFile(assetId: asset.id, originalName: asset.originalName)
            let panel = NSSavePanel()
            panel.nameFieldStringValue = asset.originalName
            panel.canCreateDirectories = true
            let response = await panel.begin()
            guard response == .OK, let destination = panel.url else { return }
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: localURL, to: destination)
            message = "已保存到本地"
        } catch {
            message = "下载失败：\(error.localizedDescription)"
        }
    }

    private func fetchAssetToTemporaryFile(assetId: String, originalName: String) async throws -> URL {
        let data = try await fetchAssetData(assetId: assetId, thumbnail: false)
        let safeName = originalName.replacingOccurrences(of: "/", with: "-")
        let dir = FileManager.default.temporaryDirectory.appending(path: "AI-Xinji-Mac", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appending(path: "\(assetId)-\(safeName)")
        try data.write(to: url, options: .atomic)
        return url
    }

    private func fetchAssetData(assetId: String, thumbnail: Bool) async throws -> Data {
        guard !accessToken.isEmpty else { throw URLError(.userAuthenticationRequired) }
        var queryItems: [URLQueryItem] = []
        if thumbnail {
            queryItems.append(URLQueryItem(name: "thumb", value: "1"))
        }
        let request = authorizedRequest(path: "/api/assets/\(assetId)", queryItems: queryItems)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw NSError(domain: "AIXinjiMac", code: 1, userInfo: [
                NSLocalizedDescriptionKey: readableError(data) ?? "附件读取失败"
            ])
        }
        return data
    }

    private func preloadVisibleImagePreviews() {
        let imageFiles = files.filter { $0.mimeType.hasPrefix("image/") }.prefix(30)
        for file in imageFiles {
            if let cached = cachedPreviewImage(assetId: file.id) {
                previewImages[file.id] = cached
            } else {
                Task { await loadPreview(for: file) }
            }
        }
    }

    private var previewCacheDirectory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base
            .appending(path: "AI-Xinji-Mac", directoryHint: .isDirectory)
            .appending(path: "PreviewCache", directoryHint: .isDirectory)
    }

    private func previewCacheURL(assetId: String) -> URL {
        previewCacheDirectory.appending(path: "\(assetId).img")
    }

    private func cachedPreviewImage(assetId: String) -> NSImage? {
        let url = previewCacheURL(assetId: assetId)
        guard FileManager.default.fileExists(atPath: url.path),
              let data = try? Data(contentsOf: url) else {
            return nil
        }
        return NSImage(data: data)
    }

    private func writePreviewCache(_ data: Data, assetId: String) {
        do {
            try FileManager.default.createDirectory(at: previewCacheDirectory, withIntermediateDirectories: true)
            try data.write(to: previewCacheURL(assetId: assetId), options: .atomic)
        } catch {
            return
        }
    }

    private func makeCaptureAttachment(from image: NSImage) -> CaptureAttachment? {
        guard let tiff = image.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let png = bitmap.representation(using: .png, properties: [:]) else {
            return nil
        }
        do {
            let dir = FileManager.default.temporaryDirectory.appending(path: "AI-Xinji-Capture", directoryHint: .isDirectory)
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let url = dir.appending(path: "clipboard-\(Int(Date().timeIntervalSince1970)).png")
            try png.write(to: url, options: .atomic)
            return CaptureAttachment.make(url: url)
        } catch {
            return nil
        }
    }

    private func authorizedRequest(path: String, queryItems: [URLQueryItem] = []) -> URLRequest {
        var components = URLComponents(url: apiBaseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }
        var request = URLRequest(url: components.url!)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func webURL(queryItems: [URLQueryItem]) -> URL {
        var components = URLComponents(url: apiBaseURL, resolvingAgainstBaseURL: false)!
        components.queryItems = queryItems
        return components.url ?? apiBaseURL
    }

    private func readableError(_ data: Data) -> String? {
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let error = json["error"] as? String {
            return error
        }
        let text = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return text?.isEmpty == false ? text : nil
    }
}

extension JSONDecoder {
    static var aixinji: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
