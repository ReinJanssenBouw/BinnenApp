import UIKit
import ARKit
import SceneKit
import AVFoundation
import simd

final class RackARController: UIViewController, ARSCNViewDelegate, ARSessionDelegate {
    private let payload: ARPayload
    private let ar = ARSCNView()
    private let status = UILabel()
    private let saveButton = UIButton(type: .system)
    private let placeButton = UIButton(type: .system)
    private let searchButton = UIButton(type: .system)
    private var points: [SIMD3<Float>] = []
    private var pointNodes: [SCNNode] = []
    private var placing = false
    private var anchor: ARAnchor?
    private var rackNode: SCNNode?
    private var width: Float = 2
    private var height: Float = 2
    private var normalTracking = false
    private var unsaved = false
    private var saving = false
    private var selected: (x: Int, y: Int)?
    private var loadedName: String?
    private var timeout: Timer?
    private var configuration: ARWorldTrackingConfiguration?
    private var started = false

    init(payload: ARPayload) { self.payload = payload; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        ar.frame = view.bounds; ar.autoresizingMask = [.flexibleWidth,.flexibleHeight]
        ar.scene = SCNScene(); ar.delegate = self; ar.session.delegate = self
        ar.session.delegateQueue = .main
        view.addSubview(ar)
        ar.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tap(_:))))
        let close = UIButton(type: .system); close.setTitle("Sluiten", for: .normal)
        close.addTarget(self, action: #selector(closeAR), for: .touchUpInside)
        let title = UILabel(); title.text = payload.rack.name; title.textColor = .white; title.font = .boldSystemFont(ofSize: 18)
        let top = UIStackView(arrangedSubviews: [title,close]); top.distribution = .fill; top.spacing = 12
        status.numberOfLines = 0; status.textAlignment = .center; status.textColor = .white; status.font = .systemFont(ofSize: 15, weight: .medium)
        status.backgroundColor = UIColor(red: 0.06, green: 0.15, blue: 0.27, alpha: 0.88)
        status.layer.cornerRadius = 12; status.clipsToBounds = true
        status.text = "Beweeg je iPhone rustig om de omgeving te scannen."
        placeButton.setTitle("Plaatsen", for: .normal); placeButton.addTarget(self, action: #selector(confirmPlacement), for: .touchUpInside)
        saveButton.setTitle("Opslaan", for: .normal); saveButton.addTarget(self, action: #selector(save), for: .touchUpInside)
        searchButton.setTitle("Zoek product", for: .normal); searchButton.addTarget(self, action: #selector(search), for: .touchUpInside)
        let bottom = UIStackView(arrangedSubviews: [placeButton,saveButton,searchButton]); bottom.spacing = 8; bottom.distribution = .fillEqually
        for b in [close,placeButton,saveButton,searchButton] {
            b.configuration = .filled(); b.configuration?.baseBackgroundColor = UIColor(red:0.14,green:0.32,blue:0.72,alpha:1)
            b.configuration?.baseForegroundColor = .white; b.titleLabel?.font = .systemFont(ofSize:14,weight:.semibold)
            b.heightAnchor.constraint(greaterThanOrEqualToConstant: 46).isActive = true
        }
        for v in [top,status,bottom] { v.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(v) }
        NSLayoutConstraint.activate([
            top.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor,constant:8),top.leadingAnchor.constraint(equalTo:view.leadingAnchor,constant:16),top.trailingAnchor.constraint(equalTo:view.trailingAnchor,constant:-16),
            status.topAnchor.constraint(equalTo:top.bottomAnchor,constant:12),status.leadingAnchor.constraint(equalTo:view.leadingAnchor,constant:16),status.trailingAnchor.constraint(equalTo:view.trailingAnchor,constant:-16),status.heightAnchor.constraint(greaterThanOrEqualToConstant:72),
            bottom.bottomAnchor.constraint(equalTo:view.safeAreaLayoutGuide.bottomAnchor,constant:-12),bottom.leadingAnchor.constraint(equalTo:view.leadingAnchor,constant:12),bottom.trailingAnchor.constraint(equalTo:view.trailingAnchor,constant:-12)
        ])
        updateButtons()
        NotificationCenter.default.addObserver(self, selector:#selector(background), name:UIApplication.didEnterBackgroundNotification, object:nil)
        NotificationCenter.default.addObserver(self, selector:#selector(foreground), name:UIApplication.didBecomeActiveNotification, object:nil)
        AVCaptureDevice.requestAccess(for:.video) { [weak self] granted in
            DispatchQueue.main.async {
                guard let self = self, self.view.window != nil else { return }
                if granted { self.start() } else { self.status.text = "Geef BinnenApp cameratoegang in Instellingen om AR te gebruiken." }
            }
        }
    }
    deinit { NotificationCenter.default.removeObserver(self); timeout?.invalidate() }
    override func viewWillDisappear(_ animated: Bool) { super.viewWillDisappear(animated); ar.session.pause() }
    override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); if started, let config = configuration { ar.session.run(config) } }
    private func start() {
        guard !started else { return }; started = true
        let config = ARWorldTrackingConfiguration(); config.planeDetection = [.horizontal,.vertical]
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) { config.sceneReconstruction = .mesh }
        do {
            if let saved = try WorldStore.load(payload), let map = try NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from:saved.map) {
                config.initialWorldMap = map; width = saved.width; height = saved.height; loadedName = saved.anchorName
                status.text = "Opgeslagen plek zoeken. Richt op dezelfde stelling en beweeg langzaam."
                timeout = Timer.scheduledTimer(withTimeInterval:25,repeats:false) { [weak self] _ in
                    guard let self = self, self.anchor == nil || !self.normalTracking else { return }
                    self.status.text = "De plek is nog niet herkend. Bekijk de stelling vanuit de oorspronkelijke hoek of kies Plaatsen."
                }
            } else { status.text = "Scan de stelling rustig. Tik daarna op Plaatsen om drie hoeken aan te wijzen." }
        } catch { status.text = "De opgeslagen indeling is veranderd of niet leesbaar. Plaats de stelling opnieuw." }
        configuration = config; ar.session.run(config,options:[.resetTracking,.removeExistingAnchors])
    }
    @objc private func background() { ar.session.pause(); normalTracking = false; rackNode?.isHidden = true; updateButtons() }
    @objc private func foreground() { if started, view.window != nil, let config = configuration { ar.session.run(config); status.text = "Omgeving opnieuw herkennen…" } }
    private func updateButtons() {
        saveButton.isEnabled = anchor != nil && normalTracking && !placing && !saving
        placeButton.isEnabled = started && !saving
        searchButton.isEnabled = anchor != nil && normalTracking && !placing && !payload.placed.isEmpty && !saving
    }
    @objc private func closeAR() {
        guard !saving else { return }
        if unsaved {
            let alert = UIAlertController(title:"Niet opgeslagen",message:"De nieuwe AR-plek is nog niet opgeslagen. Toch sluiten?",preferredStyle:.alert)
            alert.addAction(UIAlertAction(title:"Terug",style:.cancel))
            alert.addAction(UIAlertAction(title:"Sluiten",style:.destructive) { [weak self] _ in self?.dismiss(animated:true) })
            present(alert,animated:true)
        } else { dismiss(animated:true) }
    }
    @objc private func confirmPlacement() {
        let alert = UIAlertController(title:"Stelling plaatsen", message:"Tik straks op drie hoeken aan de voorkant: linksonder, rechtsonder en linksboven. De rijen krijgen eerst een gelijke hoogte. Je bestaande opgeslagen plek wordt pas vervangen als je Opslaan kiest.", preferredStyle:.alert)
        alert.addAction(UIAlertAction(title:"Annuleren",style:.cancel))
        alert.addAction(UIAlertAction(title:"Beginnen",style:.default) { [weak self] _ in self?.beginPlacement() })
        present(alert,animated:true)
    }
    private func beginPlacement() {
        timeout?.invalidate(); loadedName = nil
        if let anchor = anchor { ar.session.remove(anchor:anchor) }
        anchor = nil; rackNode?.removeFromParentNode(); rackNode = nil
        points.removeAll(); pointNodes.forEach { $0.removeFromParentNode() }; pointNodes.removeAll()
        placing = true; selected = nil; unsaved = false
        // Reset when an old world cannot be relocalized; no saved files are deleted.
        if !normalTracking, let config = configuration { config.initialWorldMap = nil; ar.session.run(config,options:[.resetTracking,.removeExistingAnchors]) }
        status.text = "1 / 3 — Tik op de hoek LINKSONDER van de stelling."; updateButtons()
    }
    @objc private func tap(_ gesture: UITapGestureRecognizer) {
        guard placing, normalTracking else { return }
        guard let query = ar.raycastQuery(from:gesture.location(in:ar),allowing:.estimatedPlane,alignment:.any), let hit = ar.session.raycast(query).first else {
            status.text = "Nog geen oppervlak gevonden. Beweeg rustig en tik opnieuw op de hoek."; return
        }
        let c = hit.worldTransform.columns.3; let point = SIMD3<Float>(c.x,c.y,c.z)
        points.append(point)
        let dot = SCNNode(geometry:SCNSphere(radius:0.015)); dot.geometry?.firstMaterial?.diffuse.contents = UIColor.systemCyan; dot.simdPosition = point
        ar.scene.rootNode.addChildNode(dot); pointNodes.append(dot)
        if points.count == 1 { status.text = "2 / 3 — Tik op de hoek RECHTSONDER, op dezelfde hoogte." }
        if points.count == 2 { status.text = "3 / 3 — Tik op de hoek LINKSBOVEN." }
        if points.count == 3 {
            do {
                let placement = try RackPlacement(points:points); width = placement.width; height = placement.height
                let newAnchor = ARAnchor(name:"binnenapp-\(payload.rack.id)",transform:placement.transform)
                anchor = newAnchor; placing = false; unsaved = true; ar.session.add(anchor:newAnchor)
                pointNodes.forEach { $0.removeFromParentNode() }; pointNodes.removeAll()
                status.text = String(format:"Stelling geplaatst: %.2f m breed × %.2f m hoog. Controleer de vakken en kies Opslaan.",width,height)
                updateButtons()
            } catch { beginPlacement(); status.text = "De hoeken vormen geen rechte stelling. Begin opnieuw bij LINKSONDER." }
        }
    }
    func renderer(_ renderer: SCNSceneRenderer, didAdd node: SCNNode, for added: ARAnchor) {
        guard added.name == "binnenapp-\(payload.rack.id)" || (loadedName != nil && added.name == loadedName) else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.anchor = added; self.rackNode = node; self.drawRack(node); node.isHidden = !self.normalTracking
            self.updateButtons()
        }
    }
    func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        switch camera.trackingState {
        case .normal:
            normalTracking = true
            if anchor != nil && !unsaved { status.text = "Stelling herkend. Je kunt bewegen of een product zoeken." }
            else if placing { status.text = ["1 / 3 — Tik LINKSONDER.","2 / 3 — Tik RECHTSONDER.","3 / 3 — Tik LINKSBOVEN."][min(points.count,2)] }
        case .limited(let reason):
            normalTracking = false
            switch reason {
            case .relocalizing: status.text = "Opgeslagen omgeving herkennen. Richt op de stelling en beweeg langzaam."
            case .excessiveMotion: status.text = "Beweeg wat langzamer om de vakken op hun plek te houden."
            case .insufficientFeatures: status.text = "Richt op meer details en zorg voor voldoende licht."
            default: status.text = "Omgeving scannen… beweeg je iPhone rustig."
            }
        case .notAvailable: normalTracking = false; status.text = "AR-tracking is tijdelijk niet beschikbaar."
        }
        rackNode?.isHidden = !normalTracking; updateButtons()
    }
    func sessionWasInterrupted(_ session: ARSession) { background(); status.text = "Camera onderbroken. De plek wordt opnieuw herkend zodra je terugkomt." }
    func sessionShouldAttemptRelocalization(_ session: ARSession) -> Bool { true }
    func session(_ session: ARSession, didFailWithError error: Error) { normalTracking = false; rackNode?.isHidden = true; status.text = "AR is onderbroken. Sluit de camera en probeer opnieuw. \(error.localizedDescription)"; updateButtons() }
    @objc private func save() {
        guard let anchor = anchor, normalTracking, let frame = ar.session.currentFrame else { return }
        guard frame.worldMappingStatus == .mapped || frame.worldMappingStatus == .extending else { status.text = "Scan ook de omgeving naast de stelling en probeer Opslaan opnieuw."; return }
        saving = true; updateButtons(); status.text = "Plek opslaan op deze iPhone…"
        ar.session.getCurrentWorldMap { [weak self] map,error in
            DispatchQueue.main.async {
                guard let self = self else { return }; self.saving = false; defer { self.updateButtons() }
                do {
                    guard let map = map, map.anchors.contains(where: { $0.identifier == anchor.identifier }) else { throw error ?? PayloadError.invalid }
                    let encoded = try NSKeyedArchiver.archivedData(withRootObject:map,requiringSecureCoding:true)
                    let saved = StoredWorld(version:1,counts:self.payload.rack.counts,width:self.width,height:self.height,anchorName:anchor.name!,savedAt:Date(),map:encoded)
                    try WorldStore.save(saved,payload:self.payload); self.unsaved = false
                    self.status.text = "Opgeslagen op deze iPhone. Open hier later dezelfde stelling om de plek terug te herkennen."
                } catch { self.status.text = "Opslaan mislukt. Scan iets meer van de omgeving en probeer opnieuw." }
            }
        }
    }
    private func drawRack(_ node: SCNNode) {
        node.childNodes.forEach { $0.removeFromParentNode() }
        let rowHeight = height / Float(payload.rack.rows)
        for y in 1...payload.rack.rows {
            let cols = payload.rack.counts[y-1], cellWidth = width / Float(cols)
            for x in 1...cols {
                let chosen = selected?.x == x && selected?.y == y
                let products = payload.placed.filter { $0.x == x && $0.y == y }
                let color: UIColor = chosen ? .systemYellow : .systemCyan
                let frame = SCNBox(width:CGFloat(cellWidth - 0.005),height:CGFloat(rowHeight - 0.005),length:0.025,chamferRadius:0)
                frame.firstMaterial?.diffuse.contents = color; frame.firstMaterial?.lightingModel = .constant; frame.firstMaterial?.fillMode = .lines
                let cell = SCNNode(geometry:frame); cell.position = SCNVector3((Float(x)-0.5)*cellWidth,(Float(y)-0.5)*rowHeight,0)
                node.addChildNode(cell)
                if !products.isEmpty || chosen {
                    let text = "X\(x) · Y\(y)\n" + products.map { "\($0.jb_code ?? "") \($0.description)" }.joined(separator:"\n")
                    let size = CGSize(width:640,height:240)
                    let image = UIGraphicsImageRenderer(size:size).image { ctx in
                        (chosen ? UIColor(red:0.45,green:0.30,blue:0,alpha:0.94) : UIColor(red:0.05,green:0.17,blue:0.35,alpha:0.94)).setFill(); ctx.fill(CGRect(origin:.zero,size:size))
                        let style = NSMutableParagraphStyle(); style.lineBreakMode = .byTruncatingTail
                        (text as NSString).draw(in:CGRect(x:16,y:12,width:608,height:216),withAttributes:[.font:UIFont.systemFont(ofSize:30,weight:.semibold),.foregroundColor:UIColor.white,.paragraphStyle:style])
                    }
                    let label = SCNPlane(width:CGFloat(cellWidth*0.90),height:CGFloat(min(rowHeight*0.8,cellWidth*0.38)))
                    label.firstMaterial?.diffuse.contents = image; label.firstMaterial?.lightingModel = .constant; label.firstMaterial?.isDoubleSided = true
                    let labelNode = SCNNode(geometry:label); labelNode.position = SCNVector3(0,0,0.02); cell.addChildNode(labelNode)
                }
            }
        }
    }
    @objc private func search() {
        let controller = ProductSearchController(products:payload.placed) { [weak self] product in
            guard let self = self else { return }; self.selected = (product.x,product.y)
            if let node = self.rackNode { self.drawRack(node) }
            self.status.text = "\(product.jb_code ?? "") · \(product.description)\nRij Y\(product.y), vak X\(product.x) licht geel op."
        }
        present(UINavigationController(rootViewController:controller),animated:true)
    }
}

final class ProductSearchController: UITableViewController, UISearchResultsUpdating {
    let products: [Product]
    var filtered: [Product]
    let choose: (Product)->Void
    init(products:[Product],choose:@escaping(Product)->Void) { self.products = products; filtered = products; self.choose = choose; super.init(style:.insetGrouped) }
    required init?(coder:NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad(); title = "Zoek in deze stelling"
        let search = UISearchController(searchResultsController:nil); search.searchResultsUpdater = self; search.obscuresBackgroundDuringPresentation = false
        search.searchBar.placeholder = "Productnaam of JB-code"; navigationItem.searchController = search; navigationItem.hidesSearchBarWhenScrolling = false
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem:.close,target:self,action:#selector(closeSearch))
    }
    @objc private func closeSearch() { dismiss(animated:true) }
    func updateSearchResults(for searchController: UISearchController) { let query = searchController.searchBar.text ?? ""; filtered = products.filter { query.isEmpty || "\($0.jb_code ?? "") \($0.description)".localizedCaseInsensitiveContains(query) }; tableView.reloadData() }
    override func tableView(_ tableView:UITableView,numberOfRowsInSection section:Int)->Int { filtered.count }
    override func tableView(_ tableView:UITableView,cellForRowAt indexPath:IndexPath)->UITableViewCell {
        let cell = UITableViewCell(style:.subtitle,reuseIdentifier:nil), p = filtered[indexPath.row]
        cell.textLabel?.text = p.description; cell.textLabel?.numberOfLines = 2; cell.detailTextLabel?.text = "\(p.jb_code ?? "") · Y\(p.y) / X\(p.x)"; return cell
    }
    override func tableView(_ tableView:UITableView,didSelectRowAt indexPath:IndexPath) { let p = filtered[indexPath.row]; dismiss(animated:true) { self.choose(p) } }
}
