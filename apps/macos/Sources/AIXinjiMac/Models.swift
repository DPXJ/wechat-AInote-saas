import Foundation
import UniformTypeIdentifiers

struct AuthResponse: Decodable {
    let accessToken: String
    let user: AuthUser

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case user
    }
}

struct AuthUser: Decodable {
    let email: String?
}

struct FileTimelineResponse: Decodable {
    let files: [FileTimelineItem]
}

struct FavoriteTimelineResponse: Decodable {
    let records: [KnowledgeRecord]
    let total: Int?
}

struct RecordAsset: Identifiable, Decodable, Hashable {
    let id: String
    let recordId: String
    let originalName: String
    let mimeType: String
    let byteSize: Int
    let storageKey: String
    let tags: [String]
    let description: String
    let ocrText: String
    let createdAt: String

    var kindLabel: String {
        if mimeType.hasPrefix("image/") { return "图片" }
        if mimeType == "application/pdf" { return "PDF" }
        if mimeType.hasPrefix("video/") { return "视频" }
        if mimeType.hasPrefix("audio/") { return "音频" }
        if mimeType.localizedCaseInsensitiveContains("sheet") || mimeType.localizedCaseInsensitiveContains("excel") { return "表格" }
        if mimeType.localizedCaseInsensitiveContains("word") || mimeType.localizedCaseInsensitiveContains("document") { return "文档" }
        return "文件"
    }

    var byteSizeText: String {
        if byteSize < 1024 { return "\(byteSize) B" }
        if byteSize < 1024 * 1024 { return String(format: "%.1f KB", Double(byteSize) / 1024) }
        return String(format: "%.1f MB", Double(byteSize) / 1024 / 1024)
    }
}

indirect enum JSONValue: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .null
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

struct SyncRun: Identifiable, Decodable, Hashable {
    let id: String
    let recordId: String
    let target: String
    let status: String
    let externalRef: String?
    let payload: [String: JSONValue]?
    let message: String
    let createdAt: String
    let updatedAt: String
}

struct KnowledgeRecord: Identifiable, Decodable, Hashable {
    let id: String
    let title: String
    let sourceLabel: String
    let sourceChannel: String
    let recordType: String
    let contentText: String
    let extractedText: String
    let summary: String
    let contextNote: String
    let keywords: [String]
    let actionItems: [String]
    let suggestedTargets: [String]
    let createdAt: String
    let updatedAt: String
    let assets: [RecordAsset]
    let syncRuns: [SyncRun]
    let confirmedAt: String?

    var typeLabel: String {
        switch recordType {
        case "image": return "图片"
        case "pdf": return "PDF"
        case "document": return "文档"
        case "audio": return "音频"
        case "video": return "视频"
        case "mixed": return "混合"
        default: return "文本"
        }
    }

    var bestSummary: String {
        if !summary.isEmpty { return summary }
        if !extractedText.isEmpty { return extractedText }
        if !contentText.isEmpty { return contentText }
        if let asset = assets.first, !asset.description.isEmpty { return asset.description }
        return "暂无摘要"
    }

    var searchHaystack: String {
        ([
            title,
            sourceLabel,
            sourceChannel,
            recordType,
            contentText,
            extractedText,
            summary,
            contextNote
        ] + keywords + actionItems + assets.flatMap { [$0.originalName, $0.description, $0.ocrText] + $0.tags }).joined(separator: " ")
    }
}

struct ProjectsResponse: Decodable {
    let projects: [Project]
}

struct Project: Identifiable, Decodable, Hashable {
    let id: String
    let name: String
    let description: String
    let archived: Bool
    let sortOrder: Int
    let createdAt: String
    let updatedAt: String
    let doneCount: Int?
    let totalTasks: Int?

    var progressText: String {
        let done = doneCount ?? 0
        let total = totalTasks ?? 0
        return total > 0 ? "\(done)/\(total) 完成" : "暂无任务"
    }

    var searchHaystack: String {
        [name, description, createdAt, updatedAt].joined(separator: " ")
    }
}

struct ProjectMutationResponse: Decodable {
    let project: Project?
}

enum AppSection: String, CaseIterable {
    case capture
    case timeline
    case projects
    case favorites
    case todos
    case settings

    var title: String {
        switch self {
        case .capture: return "录入"
        case .timeline: return "时间线"
        case .projects: return "项目"
        case .favorites: return "收藏"
        case .todos: return "待办"
        case .settings: return "设置"
        }
    }

    var systemImage: String {
        switch self {
        case .capture: return "plus.circle"
        case .timeline: return "clock.arrow.circlepath"
        case .projects: return "folder"
        case .favorites: return "star"
        case .todos: return "checkmark.square"
        case .settings: return "gearshape"
        }
    }
}

struct CaptureAttachment: Identifiable, Hashable {
    let id = UUID()
    let url: URL
    let name: String
    let byteSize: Int64
    let mimeType: String
    var tags = ""
    var note = ""

    var byteSizeText: String {
        if byteSize < 1024 { return "\(byteSize) B" }
        if byteSize < 1024 * 1024 { return String(format: "%.1f KB", Double(byteSize) / 1024) }
        return String(format: "%.1f MB", Double(byteSize) / 1024 / 1024)
    }

    static func make(url: URL) -> CaptureAttachment {
        let values = try? url.resourceValues(forKeys: [.fileSizeKey, .typeIdentifierKey])
        let typeIdentifier = values?.typeIdentifier ?? UTType(filenameExtension: url.pathExtension)?.identifier
        let mimeType = typeIdentifier.flatMap { UTType($0)?.preferredMIMEType } ?? "application/octet-stream"
        return CaptureAttachment(
            url: url,
            name: url.lastPathComponent,
            byteSize: Int64(values?.fileSize ?? 0),
            mimeType: mimeType,
            tags: "",
            note: ""
        )
    }

    var isImage: Bool {
        mimeType.hasPrefix("image/")
    }
}

struct CreateRecordResponse: Decodable {
    let record: CreatedRecord?
}

struct CreatedRecord: Decodable {
    let id: String
}

struct TodoListResponse: Decodable {
    let todos: [TodoItem]
    let total: Int
}

struct TodoMutationResponse: Decodable {
    let todo: TodoItem?
}

struct TodoSyncResponse: Decodable {
    let ok: Bool?
    let todo: TodoItem?
    let message: String?
}

struct TodoBatchSyncResponse: Decodable {
    let synced: Int?
    let failed: Int?
    let message: String?
}

struct TodoItem: Identifiable, Decodable, Hashable {
    let id: String
    let recordId: String?
    let content: String
    let priority: String
    let status: String
    let createdAt: String
    let completedAt: String?
    let updatedAt: String
    let deletedAt: String?
    let syncedAt: String?

    var isDone: Bool { status == "done" }
    var priorityLabel: String {
        switch priority {
        case "urgent": return "紧急"
        case "high": return "高"
        case "low": return "低"
        default: return "中"
        }
    }

    var createdDate: Date? { Date.aixinjiISODate(from: createdAt) }
    var updatedDate: Date? { Date.aixinjiISODate(from: updatedAt) }
    var syncedDate: Date? { syncedAt.flatMap { Date.aixinjiISODate(from: $0) } }

    var needsTickTickSync: Bool {
        guard !id.hasPrefix("local_todo_"), !isDone else { return false }
        guard let syncedDate else { return true }
        if let updatedDate { return updatedDate > syncedDate }
        return false
    }

    var dayKey: String {
        guard let createdDate else { return "unknown" }
        return DateFormatter.aixinjiDayKey.string(from: createdDate)
    }

    var dayTitle: String {
        guard let createdDate else { return "未知日期" }
        if Calendar.current.isDateInToday(createdDate) { return "今天" }
        if Calendar.current.isDateInYesterday(createdDate) { return "昨天" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M月d日"
        return formatter.string(from: createdDate)
    }
}

struct SettingsResponse: Decodable {
    let settings: IntegrationSettings
}

struct IntegrationTestResponse: Decodable {
    let ok: Bool?
    let message: String?
    let error: String?
}

struct IntegrationSettings: Codable, Equatable {
    var aiProvider: String
    var aiApiKey: String
    var aiSummaryPrompt: String
    var aiTodoPrompt: String
    var storageMode: String
    var notionToken: String
    var notionParentPageId: String
    var smtpHost: String
    var smtpPort: String
    var smtpSecure: Bool
    var smtpUser: String
    var smtpPass: String
    var smtpFrom: String
    var tickTickInboxEmail: String
    var ossRegion: String
    var ossBucket: String
    var ossEndpoint: String
    var ossAccessKeyId: String
    var ossAccessKeySecret: String
    var ossPathPrefix: String
    var ossPublicBaseUrl: String
    var visionModelBaseUrl: String
    var visionModelApiKey: String
    var visionModelName: String
    var ocrEnabled: Bool
    var imapHost: String
    var imapPort: String
    var imapUser: String
    var imapPass: String
    var imapSecure: Bool
    var flomoWebhookUrl: String
    var flashMemoIngestToken: String

    static let defaults = IntegrationSettings(
        aiProvider: "",
        aiApiKey: "",
        aiSummaryPrompt: "",
        aiTodoPrompt: "",
        storageMode: "oss",
        notionToken: "",
        notionParentPageId: "",
        smtpHost: "",
        smtpPort: "587",
        smtpSecure: false,
        smtpUser: "",
        smtpPass: "",
        smtpFrom: "",
        tickTickInboxEmail: "",
        ossRegion: "",
        ossBucket: "",
        ossEndpoint: "",
        ossAccessKeyId: "",
        ossAccessKeySecret: "",
        ossPathPrefix: "",
        ossPublicBaseUrl: "",
        visionModelBaseUrl: "",
        visionModelApiKey: "",
        visionModelName: "",
        ocrEnabled: false,
        imapHost: "",
        imapPort: "993",
        imapUser: "",
        imapPass: "",
        imapSecure: true,
        flomoWebhookUrl: "",
        flashMemoIngestToken: ""
    )

    var aiConfigured: Bool {
        !aiProvider.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !aiApiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var tickTickConfigured: Bool {
        !smtpHost.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !smtpUser.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !smtpPass.isEmpty &&
        !tickTickInboxEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct FileTimelineItem: Identifiable, Decodable, Hashable {
    let id: String
    let recordId: String
    let originalName: String
    let mimeType: String
    let byteSize: Int
    let tags: [String]
    let description: String
    let ocrText: String
    let createdAt: String
    let recordTitle: String
    let recordSummary: String
    let recordSourceLabel: String
    let recordCreatedAt: String
    let recordContentText: String
    let recordExtractedText: String
    let recordKeywords: [String]
    let recordActionItems: [String]

    var bestDescription: String {
        if !description.isEmpty { return description }
        if !recordSummary.isEmpty { return recordSummary }
        if !ocrText.isEmpty { return ocrText }
        if !recordExtractedText.isEmpty { return recordExtractedText }
        return "暂无描述"
    }

    var analysisText: String {
        if !recordExtractedText.isEmpty { return recordExtractedText }
        if !ocrText.isEmpty { return ocrText }
        return recordContentText
    }

    var allTags: [String] {
        Array(NSOrderedSet(array: tags + recordKeywords)) as? [String] ?? tags + recordKeywords
    }

    var searchHaystack: String {
        ([
            originalName,
            mimeType,
            description,
            ocrText,
            recordTitle,
            recordSummary,
            recordSourceLabel,
            recordContentText,
            recordExtractedText
        ] + tags + recordKeywords + recordActionItems).joined(separator: " ")
    }

    var kindLabel: String {
        if mimeType.hasPrefix("image/") { return "图片" }
        if mimeType == "application/pdf" { return "PDF" }
        if mimeType.hasPrefix("video/") { return "视频" }
        if mimeType.hasPrefix("audio/") { return "音频" }
        if mimeType.localizedCaseInsensitiveContains("sheet") || mimeType.localizedCaseInsensitiveContains("excel") { return "表格" }
        if mimeType.localizedCaseInsensitiveContains("word") || mimeType.localizedCaseInsensitiveContains("document") { return "文档" }
        return "文件"
    }

    var byteSizeText: String {
        if byteSize < 1024 { return "\(byteSize) B" }
        if byteSize < 1024 * 1024 { return String(format: "%.1f KB", Double(byteSize) / 1024) }
        return String(format: "%.1f MB", Double(byteSize) / 1024 / 1024)
    }

    var createdDate: Date? {
        Date.aixinjiISODate(from: createdAt)
    }

    var dayKey: String {
        guard let createdDate else { return "unknown" }
        return DateFormatter.aixinjiDayKey.string(from: createdDate)
    }

    var dayTitle: String {
        guard let createdDate else { return "未知日期" }
        if Calendar.current.isDateInToday(createdDate) { return "今天" }
        if Calendar.current.isDateInYesterday(createdDate) { return "昨天" }
        return DateFormatter.aixinjiDayTitle.string(from: createdDate)
    }

    var timeText: String {
        guard let createdDate else { return createdAt }
        return DateFormatter.aixinjiTime.string(from: createdDate)
    }

    var hasTodo: Bool {
        !recordActionItems.isEmpty || searchHaystack.localizedCaseInsensitiveContains("待办")
    }
}

extension String {
    var shortDateTime: String {
        if let date = Date.aixinjiISODate(from: self) {
            return DateFormatter.aixinjiDateTime.string(from: date)
        }
        return self
    }
}

extension Date {
    static func aixinjiISODate(from text: String) -> Date? {
        if let date = ISO8601DateFormatter.aixinji.date(from: text) {
            return date
        }
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fallback.date(from: text)
    }
}

extension ISO8601DateFormatter {
    static let aixinji: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

extension DateFormatter {
    static let aixinjiDayKey: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static let aixinjiDayTitle: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy年M月d日 EEEE"
        return formatter
    }()

    static let aixinjiTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    static let aixinjiDateTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy/MM/dd HH:mm"
        return formatter
    }()
}
