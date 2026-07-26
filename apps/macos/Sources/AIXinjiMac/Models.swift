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

struct FileTimelineItem: Identifiable, Decodable {
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
}
