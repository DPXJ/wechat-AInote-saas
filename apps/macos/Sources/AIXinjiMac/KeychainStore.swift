import Foundation

enum KeychainStore {
    private static let prefix = "com.linknewai.aixinji.mac.localCredential."

    static func save(_ value: String, account: String) {
        UserDefaults.standard.set(value, forKey: key(for: account))
    }

    static func read(account: String) -> String {
        UserDefaults.standard.string(forKey: key(for: account)) ?? ""
    }

    static func delete(account: String) {
        UserDefaults.standard.removeObject(forKey: key(for: account))
    }

    private static func key(for account: String) -> String {
        prefix + account
    }
}
