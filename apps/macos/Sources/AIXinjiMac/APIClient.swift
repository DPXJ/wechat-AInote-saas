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
    }

    func bootstrap() async {
        if isSignedIn {
            await loadTimeline()
        }
    }

    func signIn() async {
        guard !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !password.isEmpty else {
            message = "请填写邮箱和密码"
            return
        }
        guard let supabaseURL, !supabaseAnonKey.isEmpty else {
            message = "App 缺少 Supabase 公共配置，请重新打包 0.1 版"
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
            message = ""
            await loadTimeline()
        } catch {
            message = error.localizedDescription
        }
    }

    func signOut() {
        accessToken = ""
        password = ""
        files = []
        selectedFileId = nil
        favoriteRecordIds = []
        previewImages = [:]
        previewLoadingIds = []
        KeychainStore.delete(account: tokenAccount)
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
        previewLoadingIds.insert(file.id)
        defer { previewLoadingIds.remove(file.id) }

        do {
            let thumbData = try await fetchAssetData(file, thumbnail: true)
            if let image = NSImage(data: thumbData) {
                previewImages[file.id] = image
                return
            }
            let originalData = try await fetchAssetData(file, thumbnail: false)
            if let image = NSImage(data: originalData) {
                previewImages[file.id] = image
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
