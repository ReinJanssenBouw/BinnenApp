import Foundation
import ARKit

struct StoredWorld: Codable {
    let version: Int
    let counts: [Int]
    let width: Float
    let height: Float
    let anchorName: String
    let savedAt: Date
    let map: Data
}
enum WorldStore {
    static func url(for payload: ARPayload) throws -> URL {
        try payload.validate()
        var folder = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("AR-\(payload.userID)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try folder.setResourceValues(values)
        return folder.appendingPathComponent(payload.rack.id).appendingPathExtension("json")
    }
    static func load(_ payload: ARPayload) throws -> StoredWorld? {
        let file = try url(for: payload)
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let saved = try JSONDecoder().decode(StoredWorld.self, from: Data(contentsOf: file))
        guard saved.version == 1, saved.counts == payload.rack.counts,
              saved.width.isFinite, saved.height.isFinite,
              (0.2...20).contains(saved.width), (0.2...10).contains(saved.height) else { throw PayloadError.invalid }
        return saved
    }
    static func save(_ saved: StoredWorld, payload: ARPayload) throws {
        try JSONEncoder().encode(saved).write(to: url(for: payload), options: [.atomic, .completeFileProtection])
    }
}
