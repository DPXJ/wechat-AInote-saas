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
    let records: [FavoriteRecord]
}

struct FavoriteRecord: Decodable {
    let id: String
}

enum AppSection: String, CaseIterable {
    case capture
    case timeline
    case favorites
    case sources
    case todos

    var title: String {
        switch self {
        case .capture: return "原生录入"
        case .timeline: return "文件时间线"
        case .favorites: return "收藏"
        case .sources: return "信源"
        case .todos: return "待办"
        }
    }

    var systemImage: String {
        switch self {
        case .capture: return "plus.circle"
        case .timeline: return "doc.text"
        case .favorites: return "star"
        case .sources: return "clock"
        case .todos: return "checkmark.square"
        }
    }
}

struct CaptureAttachment: Identifiable, Hashable {
    let id = UUID()
    let url: URL
    let name: String
    let byteSize: Int64
    let mimeType: String

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
            mimeType: mimeType
        )
    }
}

struct CreateRecordResponse: Decodable {
    let record: CreatedRecord?
}

struct CreatedRecord: Decodable {
    let id: String
}

struct TodoResponse: Decodable {
    let todo: TodoItem?
}

struct TodoItem: Decodable {
    let id: String
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
