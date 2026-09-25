import XCTest
import simd
@testable import BinnenApp

final class PlacementTests: XCTestCase {
    func testThreeCornersProduceCorrectDimensionsAndOrigin() throws {
        let p = try RackPlacement(points:[SIMD3<Float>(1,0,-2),SIMD3<Float>(4,0,-2),SIMD3<Float>(1,2,-2)])
        XCTAssertEqual(p.width,3,accuracy:0.001); XCTAssertEqual(p.height,2,accuracy:0.001)
        XCTAssertEqual(p.transform.columns.3,SIMD4<Float>(1,0,-2,1))
        XCTAssertEqual(p.transform.columns.0,SIMD4<Float>(1,0,0,0))
        XCTAssertEqual(p.transform.columns.1,SIMD4<Float>(0,1,0,0))
    }
    func testRejectsCoincidentCornersAndUpsideDownShelf() {
        XCTAssertThrowsError(try RackPlacement(points:[.zero,.zero,SIMD3<Float>(0,2,0)]))
        XCTAssertThrowsError(try RackPlacement(points:[.zero,SIMD3<Float>(2,0,0),SIMD3<Float>(0,-2,0)]))
        XCTAssertThrowsError(try RackPlacement(points:[.zero,SIMD3<Float>(2,0,0),SIMD3<Float>(0,0,2)]))
    }
    func testRotatedShelfPreservesScale() throws {
        let p = try RackPlacement(points:[.zero,SIMD3<Float>(0,0,-3),SIMD3<Float>(0,2,0)])
        XCTAssertEqual(p.width,3,accuracy:0.001); XCTAssertEqual(p.height,2,accuracy:0.001)
        XCTAssertEqual(p.transform.columns.2,SIMD4<Float>(1,0,0,0))
    }
    func testRejectsInvalidRowColumns() {
        let rack = Rack(id:UUID().uuidString,name:"Stelling",rows:2,columns:3,rowColumns:[3])
        XCTAssertThrowsError(try ARPayload(userID:UUID().uuidString,rack:rack,products:[]).validate())
    }
    func testOnlyProductsInExistingCellsAreVisible() throws {
        let rack = Rack(id:UUID().uuidString,name:"Stelling",rows:2,columns:2,rowColumns:[2,4])
        func product(_ x:String,_ y:String)->Product { Product(id:1,jb_code:"JB0001",description:"Kwast",rack:"Stelling",x_axis:x,y_axis:y) }
        let payload = ARPayload(userID:UUID().uuidString,rack:rack,products:[product("4","2"),product("3","1"),product("1","0")])
        try payload.validate(); XCTAssertEqual(payload.placed.count,1); XCTAssertEqual(payload.placed.first?.x,4)
    }
    func testRejectsInvalidAccountForMapStorage() {
        let rack = Rack(id:UUID().uuidString,name:"Stelling",rows:1,columns:1,rowColumns:nil)
        XCTAssertThrowsError(try ARPayload(userID:"../other",rack:rack,products:[]).validate())
    }
}
