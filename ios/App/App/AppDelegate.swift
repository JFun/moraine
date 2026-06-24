import UIKit
import Capacitor
import WebKit
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private weak var lockedWebView: WKWebView?
    private var lockTimer: Timer?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configureAudioSession()
        return true
    }

    // Play SFX even when the ring/silent switch is on, mixing politely with other
    // audio. Logged (not try?) so the simulator/device console shows if it fails.
    private func configureAudioSession() {
        let s = AVAudioSession.sharedInstance()
        do {
            try s.setCategory(.playback, options: [.mixWithOthers])
            try s.setActive(true)
            NSLog("MORAINE-AUDIO ok category=%@ active=true", s.category.rawValue)
        } catch {
            NSLog("MORAINE-AUDIO ERROR %@", error.localizedDescription)
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        lockTimer?.invalidate(); lockTimer = nil
    }

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Backgrounding deactivates the audio session, so WebAudio SFX go silent on
        // return. Reactivate it every time we come back to the foreground (the web
        // side separately re-resumes the AudioContext on visibilitychange).
        configureAudioSession()

        // Capacitor re-touches scroll/zoom state across layout passes and the web
        // view is created late, so a one-shot lock gets undone. Re-assert it on a
        // light repeating timer — this is what makes the lock actually STICK.
        lockWebViewScroll()
        lockTimer?.invalidate()
        // .common modes so it ALSO fires during touch tracking — a default-mode
        // timer is paused mid-swipe, exactly when the lock needs re-asserting.
        let t = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in self?.lockWebViewScroll() }
        RunLoop.main.add(t, forMode: .common)
        lockTimer = t
    }

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // MARK: - Scroll lock (kills the rubber-band / zoom bounce between swipes)

    private func lockWebViewScroll() {
        // Find the web view once (then re-assert cheaply each tick).
        if lockedWebView == nil {
            guard let root = window?.rootViewController?.view,
                  let wv = findWebView(in: root) else { return }
            lockedWebView = wv
            if #available(iOS 16.4, *) { wv.isInspectable = true }   // Safari Web Inspector (diag)
            disableZoomRecognizers(in: wv)   // pinch + double-tap-zoom can't even start
        }
        guard let webView = lockedWebView else { return }

        // Dark, non-opaque so WKWebView never clears its base surface to WHITE.
        let bg = UIColor(red: 0x0c / 255.0, green: 0x0e / 255.0, blue: 0x17 / 255.0, alpha: 1) // #0c0e17
        webView.isOpaque = false
        webView.backgroundColor = bg

        // Full scroll/zoom lock, re-asserted continuously (Capacitor undoes it once).
        let sv = webView.scrollView
        sv.backgroundColor = bg
        sv.isScrollEnabled = false
        // Kill scroll/bounce at the SOURCE: with the pan recognizer disabled the
        // scroll view can't pan/rubber-band at all. DOM pointer events reach the
        // canvas through WebKit's own touch handling, not this recognizer, so
        // swipes still work.
        sv.panGestureRecognizer.isEnabled = false
        sv.bounces = false
        sv.bouncesZoom = false
        sv.alwaysBounceVertical = false
        sv.alwaysBounceHorizontal = false
        sv.minimumZoomScale = 1
        sv.maximumZoomScale = 1
        if sv.zoomScale != 1 { sv.zoomScale = 1 }
        if sv.contentOffset != .zero { sv.contentOffset = .zero }
        sv.pinchGestureRecognizer?.isEnabled = false
        sv.contentInsetAdjustmentBehavior = .never
        sv.contentInset = .zero
        sv.showsVerticalScrollIndicator = false
        sv.showsHorizontalScrollIndicator = false
        sv.delegate = self   // event-driven backstop between timer ticks
    }

    private func findWebView(in view: UIView) -> WKWebView? {
        if let wk = view as? WKWebView { return wk }
        for sub in view.subviews {
            if let found = findWebView(in: sub) { return found }
        }
        return nil
    }

    // Disable any pinch / double-tap-to-zoom recognizers anywhere under the web
    // view so a zoom can never begin (the game has no double-tap interactions).
    private func disableZoomRecognizers(in view: UIView) {
        for gr in view.gestureRecognizers ?? [] {
            if gr is UIPinchGestureRecognizer { gr.isEnabled = false }
            else if let tap = gr as? UITapGestureRecognizer, tap.numberOfTapsRequired >= 2 { gr.isEnabled = false }
        }
        for sub in view.subviews { disableZoomRecognizers(in: sub) }
    }
}

// MARK: - Continuous scroll/zoom clamp (survives Capacitor resetting flags).
// Only touches the scroll view's own offset/zoom — WKWebView still forwards
// touches to the DOM, so canvas pointer/swipe events are unaffected.
extension AppDelegate: UIScrollViewDelegate {
    func viewForZooming(in scrollView: UIScrollView) -> UIView? { nil }
    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        if scrollView.zoomScale != 1 { scrollView.zoomScale = 1 }
    }
    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        if scrollView.contentOffset != .zero { scrollView.contentOffset = .zero }
    }
}
