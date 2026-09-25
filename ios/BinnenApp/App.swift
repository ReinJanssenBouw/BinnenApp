import SwiftUI
import UIKit
import WebKit
import ARKit

@main struct BinnenApp: App {
    var body: some Scene { WindowGroup { AppScreen().ignoresSafeArea() } }
}

struct AppScreen: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WebController { WebController() }
    func updateUIViewController(_ controller: WebController, context: Context) {}
}

final class WebController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    static let host = "binnenapp-mobiel.vercel.app"
    private var web: WKWebView!
    private let errorLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.websiteDataStore = .default()
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "binnenAR")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        errorLabel.numberOfLines = 0
        errorLabel.textAlignment = .center
        errorLabel.backgroundColor = .systemBackground
        errorLabel.isUserInteractionEnabled = true
        errorLabel.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(reload)))
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errorLabel)
        NSLayoutConstraint.activate([errorLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor), errorLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor), errorLabel.widthAnchor.constraint(equalTo: view.widthAnchor, constant: -40)])
        reload()
    }

    @objc private func reload() {
        errorLabel.isHidden = true
        web.load(URLRequest(url: URL(string: "https://\(Self.host)/")!))
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        errorLabel.text = "BinnenApp laden mislukt. Controleer je verbinding.\nTik hier om opnieuw te proberen."
        errorLabel.isHidden = false
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "https", url.host == Self.host { decisionHandler(.allow); return }
        if action.targetFrame?.isMainFrame == false, url.absoluteString.hasPrefix("blob:https://\(Self.host)/") { decisionHandler(.allow); return }
        if action.navigationType == .linkActivated, ["https", "mailto", "tel"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, url.scheme == "https" { UIApplication.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "BinnenApp", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Annuleren", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Doorgaan", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "https", message.frameInfo.securityOrigin.host == Self.host,
              web.url?.host == Self.host, presentedViewController == nil else { replyHandler(nil, "AR kan hier niet worden geopend."); return }
        do {
            let encoded = try JSONSerialization.data(withJSONObject: message.body)
            guard encoded.count <= 1_000_000 else { throw PayloadError.invalid }
            let payload = try JSONDecoder().decode(ARPayload.self, from: encoded)
            try payload.validate()
            guard ARWorldTrackingConfiguration.isSupported else { replyHandler(nil, "Deze iPhone ondersteunt de AR-camera niet."); return }
            let controller = RackARController(payload: payload)
            controller.modalPresentationStyle = .fullScreen
            present(controller, animated: true)
            replyHandler(["opened": true], nil)
        } catch { replyHandler(nil, "De stellinggegevens zijn ongeldig. Vernieuw Locatie en probeer opnieuw.") }
    }
}
