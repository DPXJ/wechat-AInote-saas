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
    @Published var previewImages: [String: NSImage] = [:]
    @Published var previewLoadingIds: Set<String> = []

    var isSignedIn: Bool { !accessToken.isEmpty }
    var selectedFile: FileTimelineItem? {
        get {
            guard let selectedFileId else { return nil }
            return files.first { $0.id == selectedFileId }
        }
        set { selectedFileId = newValue?.id }
    }

    private let apiBaseURL: URL
    private let supabaseURL: URL?
    private let supabaseAnonKey: String
    private let tokenAccount = "supabase-access-token"
    private let emailAccount = "last-email"
    private let passwordAccount = "saved-password"
    private let rememberAccount = "remember-password"
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
    }

    func bootstrap() async {
        if isSignedIn {
            await loadTimeline()
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
            message = "App 缺少 Supabase 公共配置，请重新打包 0.07 版"
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
            await loadTimeline()
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
        selectedFileId = nil
        favoriteRecordIds = []
        previewImages = [:]
        previewLoadingIds = []
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
            appendField("contextNote", captureContextNote)
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
            await loadTimeline()
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

    func loadFavorites() async {
        guard !accessToken.isEmpty else { return }
        do {
            let request = authorizedRequest(path: "/api/favorites")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                return
            }
            let result = try JSONDecoder.aixinji.decode(FavoriteTimelineResponse.self, from: data)
            favoriteRecordIds = Set(result.records.map(\.id))
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

    func loadPreview(for file: FileTimelineItem) async {
        guard file.mimeType.hasPrefix("image/"), previewImages[file.id] == nil, !previewLoadingIds.contains(file.id) else {
            return
        }
        if let cached = cachedPreviewImage(for: file) {
            previewImages[file.id] = cached
            return
        }
        previewLoadingIds.insert(file.id)
        defer { previewLoadingIds.remove(file.id) }

        do {
            let thumbData = try await fetchAssetData(file, thumbnail: true)
            if let image = NSImage(data: thumbData) {
                previewImages[file.id] = image
                writePreviewCache(thumbData, for: file)
                return
            }
            let originalData = try await fetchAssetData(file, thumbnail: false)
            if let image = NSImage(data: originalData) {
                previewImages[file.id] = image
                writePreviewCache(originalData, for: file)
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

    func openWebCapture() {
        NSWorkspace.shared.open(apiBaseURL)
    }

    private func captureTitleValue(from text: String, files: [CaptureAttachment] = []) -> String {
        let manualTitle = captureTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        if !manualTitle.isEmpty { return manualTitle }
        let oneLine = text.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        if !oneLine.isEmpty { return String(oneLine.prefix(32)) }
        if let first = files.first { return first.name }
        return "Mac 录入"
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
            let localURL = try await fetchAssetToTemporaryFile(file)
            NSWorkspace.shared.open(localURL)
            message = "已打开"
        } catch {
            message = "打开失败：\(error.localizedDescription)"
        }
    }

    func downloadAsset(_ file: FileTimelineItem) async {
        do {
            let localURL = try await fetchAssetToTemporaryFile(file)
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

    private func fetchAssetToTemporaryFile(_ file: FileTimelineItem) async throws -> URL {
        let data = try await fetchAssetData(file, thumbnail: false)
        let safeName = file.originalName.replacingOccurrences(of: "/", with: "-")
        let dir = FileManager.default.temporaryDirectory.appending(path: "AI-Xinji-Mac", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appending(path: "\(file.id)-\(safeName)")
        try data.write(to: url, options: .atomic)
        return url
    }

    private func fetchAssetData(_ file: FileTimelineItem, thumbnail: Bool) async throws -> Data {
        guard !accessToken.isEmpty else { throw URLError(.userAuthenticationRequired) }
        var queryItems: [URLQueryItem] = []
        if thumbnail {
            queryItems.append(URLQueryItem(name: "thumb", value: "1"))
        }
        let request = authorizedRequest(path: "/api/assets/\(file.id)", queryItems: queryItems)
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
            if let cached = cachedPreviewImage(for: file) {
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

    private func previewCacheURL(for file: FileTimelineItem) -> URL {
        previewCacheDirectory.appending(path: "\(file.id).img")
    }

    private func cachedPreviewImage(for file: FileTimelineItem) -> NSImage? {
        let url = previewCacheURL(for: file)
        guard FileManager.default.fileExists(atPath: url.path),
              let data = try? Data(contentsOf: url) else {
            return nil
        }
        return NSImage(data: data)
    }

    private func writePreviewCache(_ data: Data, for file: FileTimelineItem) {
        do {
            try FileManager.default.createDirectory(at: previewCacheDirectory, withIntermediateDirectories: true)
            try data.write(to: previewCacheURL(for: file), options: .atomic)
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
