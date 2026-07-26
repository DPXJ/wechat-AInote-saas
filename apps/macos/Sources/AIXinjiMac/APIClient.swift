import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published var email = ""
    @Published var password = ""
    @Published var accessToken = ""
    @Published var files: [FileTimelineItem] = []
    @Published var message = ""
    @Published var isLoading = false

    var isSignedIn: Bool { !accessToken.isEmpty }

    private let apiBaseURL = URL(string: ProcessInfo.processInfo.environment["AI_XINJI_API_BASE_URL"] ?? "https://aixinji.linknewai.com")!
    private let supabaseURL = URL(string: ProcessInfo.processInfo.environment["AI_XINJI_SUPABASE_URL"] ?? "")
    private let supabaseAnonKey = ProcessInfo.processInfo.environment["AI_XINJI_SUPABASE_ANON_KEY"] ?? ""
    private let tokenAccount = "supabase-access-token"
    private let emailAccount = "last-email"

    init() {
        accessToken = KeychainStore.read(account: tokenAccount)
        email = KeychainStore.read(account: emailAccount)
    }

    func bootstrap() async {
        if isSignedIn {
            await loadTimeline()
        }
    }

    func signIn() async {
        guard !email.trimmingCharacters(in: .whitespaces).isEmpty, !password.isEmpty else {
            message = "请填写邮箱和密码"
            return
        }
        guard let supabaseURL, !supabaseAnonKey.isEmpty else {
            message = "请配置 AI_XINJI_SUPABASE_URL 和 AI_XINJI_SUPABASE_ANON_KEY"
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
                message = String(data: data, encoding: .utf8) ?? "登录失败"
                return
            }

            let auth = try JSONDecoder().decode(AuthResponse.self, from: data)
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
        KeychainStore.delete(account: tokenAccount)
    }

    func loadTimeline() async {
        guard !accessToken.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            var request = URLRequest(url: apiBaseURL.appending(path: "/api/files/timeline"))
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                message = String(data: data, encoding: .utf8) ?? "读取失败"
                return
            }
            files = try JSONDecoder().decode(FileTimelineResponse.self, from: data).files
            message = ""
        } catch {
            message = error.localizedDescription
        }
    }
}
