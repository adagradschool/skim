import UIKit
import Capacitor

/// Registers Skim's local plugins with the bridge.
class SkimViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SqlitePlugin())
        bridge?.registerPluginInstance(ShareReceiverPlugin())
    }
}
