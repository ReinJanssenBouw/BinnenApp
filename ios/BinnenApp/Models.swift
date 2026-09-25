import Foundation
import simd

enum PayloadError: Error { case invalid, corners }
struct Rack: Codable {
    let id: String
    let name: String
    let rows: Int
    let columns: Int
    let rowColumns: [Int]?
    var counts: [Int] { rowColumns ?? Array(repeating: columns, count: rows) }
}
struct Product: Codable {
    let id: Int64
    let jb_code: String?
    let description: String
    let rack: String?
    let x_axis: String?
    let y_axis: String?
    var x: Int { Int(x_axis ?? "") ?? 0 }
    var y: Int { Int(y_axis ?? "") ?? 0 }
}
struct ARPayload: Codable {
    let userID: String
    let rack: Rack
    let products: [Product]
    func validate() throws {
        guard UUID(uuidString: userID) != nil, UUID(uuidString: rack.id) != nil,
              (1...50).contains(rack.rows), (1...50).contains(rack.columns),
              rack.counts.count == rack.rows, rack.counts.allSatisfy({ (1...50).contains($0) }),
              (1...64).contains(rack.name.count), products.count <= 10000,
              products.allSatisfy({ $0.description.count <= 4000 }) else { throw PayloadError.invalid }
    }
    var placed: [Product] { products.filter { $0.rack == rack.name && (1...rack.rows).contains($0.y) && (1...rack.counts[$0.y - 1]).contains($0.x) } }
}

struct RackPlacement {
    let transform: simd_float4x4
    let width: Float
    let height: Float
    // Three measured corners: bottom left, bottom right, top left.
    init(points: [SIMD3<Float>]) throws {
        guard points.count == 3 else { throw PayloadError.corners }
        let right = points[1] - points[0]
        let w = simd_length(right)
        guard w.isFinite, (0.2...20).contains(w) else { throw PayloadError.corners }
        let x = right / w
        let rawUp = points[2] - points[0]
        let up = rawUp - simd_dot(rawUp, x) * x
        let h = simd_length(up)
        guard h.isFinite, (0.2...10).contains(h), abs(simd_dot(x, SIMD3<Float>(0,1,0))) < 0.3,
              simd_dot(up / h, SIMD3<Float>(0,1,0)) > 0.8 else { throw PayloadError.corners }
        let y = up / h, z = simd_normalize(simd_cross(x,y))
        transform = simd_float4x4(SIMD4<Float>(x,0), SIMD4<Float>(y,0), SIMD4<Float>(z,0), SIMD4<Float>(points[0],1))
        width = w; height = h
    }
}
