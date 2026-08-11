import Foundation

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
}

extension String {
    var shortDateTime: String {
        let iso = ISO8601DateFormatter()
        if let date = iso.date(from: self) {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "zh_CN")
            formatter.dateFormat = "yyyy/MM/dd HH:mm"
            return formatter.string(from: date)
        }
        return self
    }
}

